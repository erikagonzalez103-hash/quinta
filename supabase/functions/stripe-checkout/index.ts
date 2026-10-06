// Edge Function: stripe-checkout
//
// The page at /choose.html -> a Stripe Checkout Session with a promo code box.
//
// WHY THIS EXISTS
// The landing page offers three things that are not bundles: gift a seat, any
// two classes at 15% off, any three at 25%. A bundle is a pre-priced event
// type in Cal.com, which works because the contents are fixed. "Any two of
// seven" is 21 combinations and "any three" is 35, so pre-pricing them is out.
//
// Cal.com cannot take a discount code at all - it pays through Stripe's
// Payment Intents API, which has no promotion code field. So for these three
// offers the payment moves to Stripe, and the class is booked afterwards with
// a $0 "redeem" link, exactly as a bundle already works.
//
// WHY A SESSION AND NOT A PAYMENT LINK
// A Payment Link needs a Product and a Price in Stripe for every class, and
// carries at most ten optional items with one of them compulsory - which would
// force every buyer to take the same class. A Checkout Session built here can
// use inline price_data, so nothing has to exist in the Stripe catalogue and
// any combination works.
//
// WHAT STOPS SOMEONE UNDERPAYING
// Prices are read from the table below, never from the browser. The request
// carries slugs and nothing else.
//
// WHY THE CODE IS APPLIED FOR HER
// Stripe lets a session either show a promo code box or carry a discount
// already, never both. A typed code means a distracted buyer pays full price
// for two classes and has to be refunded, so the session carries it.
//
// It attaches the PROMOTION CODE, not the coupon. The minimum order amount
// lives on the promotion code; applying the bare coupon would hand out 25%
// on any cart at all. Looking it up by name each time also means a code
// archived in Stripe stops working here immediately, rather than quietly
// discounting forever from a hard-coded id.
//
// A GIFT IS NOT A DISCOUNT
// "Buy one, gift one at 25% off the gifted class" cannot be a code: a Stripe
// percentage applies to the whole cart, not to one line of it, and the
// recipient is a different person from the payer. So a gift is priced
// instead - full price for hers, 75% for the gifted one - exactly the way a
// bundle is priced. No coupon is involved and none is accepted.
//
// SHORT-LIVED BY DESIGN. Bookwhen has discount codes natively; delete this
// with the migration after 21 October.
//
// SECRETS: STRIPE_SECRET_KEY.
// Deploy with --no-verify-jwt - the page calls it with no session.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sessions as oct21Sessions, clock, salesClosed } from "../_shared/oct21.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/* 21 OCTOBER sells any class a teacher puts on the day, not only the ones
   with a $0 twin, because it never goes near Cal.com - so it has its own
   price list covering the whole paid catalogue. Keep in step with classes.js. */
const OCT21_PRICES: Record<string, { cents: number; name: string }> = {
  "entity-setup":       { cents: 17500, name: "Entity setup" },
  "banking":            { cents:  9900, name: "Banking" },
  "insurance":          { cents: 17500, name: "Insurance" },
  "bookkeeping-1":      { cents:  9900, name: "Bookkeeping I — Set up QuickBooks" },
  "bookkeeping-2":      { cents:  9900, name: "Bookkeeping II — Prep for your bookkeeper" },
  "taxes":              { cents: 25000, name: "Taxes" },
  "pricing":            { cents: 25000, name: "Pricing" },
  "contracts":          { cents: 17500, name: "Contracts" },
  "first-hire":         { cents: 17500, name: "Your first hire" },
  "certification":      { cents: 29900, name: "Get certified — WBE / MBE / DBE" },
  "financial-planning": { cents: 25000, name: "Investing — How to pay yourself first" },
  "legacy-planning":    { cents: 29900, name: "Legacy planning" },
  "trademarks":         { cents: 29900, name: "Trademarks" },
  "funding":            { cents: 17500, name: "Funding" },
  "brand-101":          { cents: 17500, name: "Brand 101" },
  "landlord":           { cents: 17500, name: "So you want to be a landlord" },
  "rental-management":  { cents: 25000, name: "Owning it without doing it all" },
  "rental-growth":      { cents: 29900, name: "Grow it and build your team" },
  "module-1":           { cents: 15000, name: "Module 1: Your First AI Workflow" },
  "module-2":           { cents: 20000, name: "Module 2 — Build your AI assistant" },
  "module-3":           { cents: 29900, name: "Module 3 — Real databases & automation" },
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const SITE = "https://quintaand.co";
const ORIGINS = [SITE, "http://localhost:8137"];   // 8137 is the local preview

/* The price of record. Deliberately not fetched from classes.js: a checkout
   must not depend on a file that a copy edit could reshape, and it must not
   trust the browser. Keep in step with classes.js - these are the classes the
   site currently shows as open, and every one of them has a $0 redeem twin in
   Cal.com to book it with afterwards. */
const PRICES: Record<string, { cents: number; name: string }> = {
  "bookkeeping-1":      { cents:  9900, name: "Bookkeeping I — Set up QuickBooks" },
  "bookkeeping-2":      { cents:  9900, name: "Bookkeeping II — Prep for your bookkeeper" },
  "module-1":           { cents: 15000, name: "Module 1: Your First AI Workflow" },
  "module-2":           { cents: 20000, name: "Module 2 — Build your AI assistant" },
  "brand-101":          { cents: 17500, name: "Brand 101" },
  "financial-planning": { cents: 25000, name: "Investing — How to pay yourself first" },
  "certification":      { cents: 29900, name: "Get certified — WBE / MBE / DBE" },
  "legacy-planning":    { cents: 29900, name: "Legacy planning" },
  "trademarks":         { cents: 29900, name: "Trademarks" },
};

/* The codes, and the number of classes each one is for. The minimum order
   amount that actually enforces this lives on the promotion code in Stripe;
   these are only for choosing which code to ask for. */
const CODE_FOR = (n: number) => (n >= 3 ? "FFF25" : n === 2 ? "FFF15" : null);

const GIFT_RATE = 0.75;          // the gifted class is 25% off

/* Does this class have a date she could actually book?

   Asked of Cal.com's public availability endpoint, which needs no key and is
   what the booking page itself uses - so it is the truth about bookable,
   not the portal's idea of scheduled. It is asked about the $0 REDEEM twin,
   because that is the door she walks through after paying; a class whose
   twin has no dates cannot be taken, whatever the class page says.

   On 30 September four of the seven classes this sold had no future date at
   all, so a buyer could pay $299 for Trademarks with nowhere to book it.
   The pages hide undated classes; this refuses them, so a hand-made request
   cannot get around the pages.

   If Cal.com itself is unreachable this lets the class through and says so
   in the log. Refusing every sale because a third party blinked would cost
   more than the rare undated sale it prevents, and "your seat keeps until you
   take it" covers her either way. */
async function hasDates(slug: string): Promise<boolean> {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const now = Date.now();
  const url = "https://api.cal.com/v2/slots"
    + `?eventTypeSlug=${encodeURIComponent(slug + "-redeem")}&username=quintaandco`
    + `&start=${day(now)}&end=${day(now + 150 * 86400000)}`;
  try {
    const r = await fetch(url, { headers: { "cal-api-version": "2024-09-04" } });
    if (!r.ok) {
      console.error(`Cal.com slots ${r.status} for ${slug} - allowing it through`);
      return true;
    }
    const d = await r.json();
    return Object.keys(d?.data || {}).length > 0;
  } catch (e) {
    console.error(`Cal.com slots unreachable for ${slug} - allowing it through`, e);
    return true;
  }
}

/* All the checks at once. Asked one after another they cost about a second
   per class, so "Continue to payment" on four classes sat for four seconds
   before anything happened - long enough to click again. */
async function undatedOf(slugs: string[]): Promise<string[]> {
  const ok = await Promise.all(slugs.map((s) => hasDates(s)));
  return slugs.filter((_, i) => !ok[i]);
}

/* The referral code, cleaned exactly the way app.js cleans it when she first
   lands, so the ledger and the faculty leaderboard compare like with like. */
function cleanRef(v: unknown): string {
  return String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
}

async function stripe(path: string, body?: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? body.toString() : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

/* The promotion code, by the name a customer would type, with the minimum
   order amount Stripe holds against it.

   The minimum is read back rather than written down here on purpose, so the
   check below compares against whatever Stripe will actually enforce. If a
   cart ever falls under it - add one cheaper class to the catalogue and a
   two-class cart could - the sale is refused with a clear reason rather
   than sent on to Stripe at a price the page never quoted.

   Returns null when the code does not exist or has been archived. */
async function promo(code: string): Promise<{ id: string; min: number } | null> {
  const r = await stripe(`promotion_codes?code=${encodeURIComponent(code)}&active=true&limit=1`);
  if (!r.ok) {
    console.error("promotion code lookup failed", r.status, JSON.stringify(r.data?.error || r.data));
    return null;
  }
  const first = Array.isArray(r.data?.data) ? r.data.data[0] : null;
  if (!first?.id) return null;
  return { id: first.id, min: Number(first?.restrictions?.minimum_amount || 0) };
}

function cors(origin: string | null) {
  const allow = origin && ORIGINS.includes(origin) ? origin : SITE;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  const head = cors(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", ...head },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: head });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    if (!STRIPE_SECRET_KEY) {
      console.error("STRIPE_SECRET_KEY is not set");
      return json({ error: "not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const offer = String(body?.offer || "");
    const isGift = offer === "gift";
    const isOct21 = offer === "oct21";

    const form = new URLSearchParams();
    form.set("mode", "payment");
    /* Cards only - Apple Pay and Google Pay ride on "card". Bank debits and
       pay-later methods report "completed" before the money has cleared, and
       the seat and her confirmation would go out for a payment that can
       still fail days later. */
    form.set("payment_method_types[0]", "card");
    /* Back to the page she came from, with her choices lost but her place
       kept - not to the top of the landing page, three scrolls away from
       where she was. */
    form.set("cancel_url", `${SITE}/${isOct21 ? "oct21" : isGift ? "gift" : "choose"}.html`);

    /* Who sent her. The pages read it from the same localStorage key app.js
       fills when she first lands on a ?ref= link, and hand it over here, so a
       sale on Stripe credits the teacher exactly as a Cal.com booking does. */
    const ref = cleanRef(body?.ref);
    if (ref) form.set("metadata[ref]", ref);

    /* Meta's browser ids (_fbp, _fbc cookies) and the browser itself, carried
       through payment so stripe-webhook can tell Meta about the purchase and
       Meta can match it to the ad click. Only the shapes Meta issues are kept;
       anything else is dropped. See _shared/meta.ts. */
    const fbId = (v: unknown) => {
      const s = String(v || "");
      return /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_.-]{1,200}$/.test(s) ? s : "";
    };
    const fbp = fbId(body?.meta?.fbp), fbc = fbId(body?.meta?.fbc);
    if (fbp) form.set("metadata[fbp]", fbp);
    if (fbc) form.set("metadata[fbc]", fbc);
    const ua = String(req.headers.get("user-agent") || "").slice(0, 400);
    if (ua) form.set("metadata[ua]", ua);

    type Line = { slug: string; cents: number; label: string };
    let lines: Line[] = [];
    let appliedCode: string | null = null;

    /* Two or more classes get the same automatic discount on 21 October as
       on Choose Your Own. Returns an error response when the code cannot be
       attached, so she is never sent on to a price the page did not quote. */
    async function discountFor(n: number): Promise<Response | null> {
      const total = lines.reduce((t, l) => t + l.cents, 0);
      const want = CODE_FOR(n);
      if (!want) { form.set("allow_promotion_codes", "false"); return null; }
      const p = await promo(want);
      if (p && total >= p.min) {
        form.set("discounts[0][promotion_code]", p.id);
        appliedCode = want;
        form.set("metadata[code]", want);
        return null;
      }
      console.error(p
        ? `${want} NOT APPLIED — cart is ${total} and the code needs ${p.min}. Refused rather than overcharge.`
        : `PROMOTION CODE ${want} NOT FOUND OR ARCHIVED. Refused rather than overcharge.`);
      return json({ error: "discount_unavailable", code: want }, 409);
    }

    if (isOct21) {
      /* WEDNESDAY 21 OCTOBER, booked here rather than in Cal.com. She picks
         sessions, not classes: two teachers can run the same class at
         different times, and each session is its own room of ten.

         Checked here, against the database, never against the page:
         - every session is on the day and not cancelled
         - every session still has a seat
         - no two in the same block, because she cannot be in two rooms
         The seat count is checked again after payment, in stripe-webhook,
         because two women can be at checkout for the last seat at once. */
      if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "not configured" }, 500);
      if (salesClosed()) return json({ error: "closed" }, 409);
      const ids: string[] = Array.from(new Set<string>(
        (Array.isArray(body?.sessions) ? body.sessions : []).map((s: unknown) => String(s))));
      if (!ids.length) return json({ error: "pick_a_class" }, 400);
      if (ids.length > 3) return json({ error: "too_many" }, 400);

      const day = await oct21Sessions(SUPABASE_URL, SERVICE_KEY);
      const byId = new Map(day.map((s) => [s.session_id, s]));
      const picked = ids.map((id) => byId.get(id));
      if (picked.some((s) => !s)) return json({ error: "unknown_session" }, 400);
      const chosen = picked as NonNullable<typeof picked[number]>[];

      const full = chosen.filter((s) => s.seats_left <= 0).map((s) => s.session_id);
      if (full.length) return json({ error: "full", sessions: full }, 409);

      /* The block comes from the start time. NOT from class_sessions.daypart:
         that only says "day" or "evening", so every class on the 21st reads
         as "day" and any two would look like the same block. */
      const blockOf = (t: string) => {
        const h = Number(String(t).slice(0, 2));
        return h < 12 ? "morning" : h < 15 ? "midday" : "afternoon";
      };
      const blocks = chosen.map((s) => blockOf(String(s.start_time)));
      if (new Set(blocks).size !== blocks.length) return json({ error: "same_block" }, 400);

      const unpriced = chosen.filter((s) => !OCT21_PRICES[s.class_slug]).map((s) => s.class_slug);
      if (unpriced.length) return json({ error: "unknown_class", slugs: unpriced }, 400);

      lines = chosen.map((s) => ({
        slug: s.class_slug,
        cents: OCT21_PRICES[s.class_slug].cents,
        label: `${OCT21_PRICES[s.class_slug].name} — Wed Oct 21, ${clock(s.start_time)}`,
      }));

      const attending = body?.attending === "online" ? "online" : "in-person";
      form.set("metadata[offer]", "oct21");
      // Same order as the lines and as metadata[cents] below - the webhook pairs them up.
      form.set("metadata[sessions]", chosen.map((s) => s.session_id).join(","));
      form.set("metadata[slugs]", chosen.map((s) => s.class_slug).join(","));
      form.set("metadata[attending]", attending);
      // The session id lets the page fire Meta's Purchase under the same id
      // the server uses, so the two count once (js/meta.js, _shared/meta.ts).
      form.set("success_url", `${SITE}/oct21.html?booked=1&s={CHECKOUT_SESSION_ID}`);
      /* Seats are not held while she pays, so an open cart is a claim on a
         seat nobody can see. Stripe's default keeps it payable for 24 hours;
         30 minutes (Stripe's minimum) keeps a sold-out class from collecting
         a stack of late payments. Erika is fine with an eleventh chair - not
         with a fifteenth. */
      form.set("expires_at", String(Math.floor(Date.now() / 1000) + 31 * 60));

      const refused = await discountFor(chosen.length);
      if (refused) return refused;
    } else if (isGift) {
      /* One for her, one at 75% for someone else. The recipient's email is
         optional on purpose - the landing page says the voucher may well be
         for the buyer herself to hand over, so a blank one means both links
         go to the payer. */
      const mine = String(body?.slug || "");
      const gift = String(body?.gift || "");
      if (!PRICES[mine] || !PRICES[gift]) {
        return json({ error: "unknown_class" }, 400);
      }
      const undated = await undatedOf(Array.from(new Set([mine, gift])));
      if (undated.length) return json({ error: "no_dates", slugs: undated }, 409);

      lines = [
        { slug: mine, cents: PRICES[mine].cents, label: PRICES[mine].name },
        { slug: gift, cents: Math.round(PRICES[gift].cents * GIFT_RATE),
          label: `${PRICES[gift].name} — gift, 25% off` },
      ];

      const to = String(body?.to || "").trim().slice(0, 200);
      const toName = String(body?.toName || "").trim().slice(0, 120);
      form.set("metadata[offer]", "gift");
      form.set("metadata[slugs]", mine);
      form.set("metadata[gift_slug]", gift);
      if (to) form.set("metadata[gift_email]", to);
      if (toName) form.set("metadata[gift_name]", toName);
      form.set("success_url", `${SITE}/bundle/?b=gift&s={CHECKOUT_SESSION_ID}`);
      /* Already discounted. A code on top would stack. */
      form.set("allow_promotion_codes", "false");
    } else {
      const raw: unknown[] = Array.isArray(body?.slugs) ? body.slugs : [];

      /* Distinct, known, and at least two - one class at full price belongs
         on its own Cal.com page, not here. The ceiling is every class in PRICES. */
      const slugs: string[] = Array.from(new Set<string>(raw.map((s) => String(s))))
        .filter((s) => Object.prototype.hasOwnProperty.call(PRICES, s));
      if (slugs.length < 2) return json({ error: "pick_at_least_two" }, 400);
      if (slugs.length > Object.keys(PRICES).length) return json({ error: "too_many" }, 400);

      const undated = await undatedOf(slugs);
      if (undated.length) return json({ error: "no_dates", slugs: undated }, 409);

      lines = slugs.map((slug) => ({
        slug, cents: PRICES[slug].cents, label: PRICES[slug].name,
      }));

      /* The webhook reads this back to know what she bought. Stripe line
         items would say the same thing, but metadata survives a partial
         refund and is one request instead of two. */
      form.set("metadata[offer]", "choose-your-own");
      form.set("metadata[slugs]", slugs.join(","));
      form.set("success_url", `${SITE}/bundle/?b=custom&s={CHECKOUT_SESSION_ID}`);

      const total = lines.reduce((t, l) => t + l.cents, 0);
      const want = CODE_FOR(slugs.length);
      const p = want ? await promo(want) : null;

      if (p && total >= p.min) {
        form.set("discounts[0][promotion_code]", p.id);
        appliedCode = want;
        form.set("metadata[code]", want as string);
      } else {
        /* The page she just left quoted her the discounted price. Sending her
           on to a full-price Stripe page would charge more than we advertised
           one screen earlier, so refuse instead and let the page tell her to
           email. A lost sale is recoverable; an overcharge is a refund and a
           woman who will not come back.

           Happens only if the code has been archived, the lookup failed, or
           the catalogue gained a class cheap enough to fall under a minimum. */
        console.error(
          p
            ? `${want} NOT APPLIED — cart is ${total} and the code needs ${p.min}. Refused rather than overcharge.`
            : `PROMOTION CODE ${want} NOT FOUND OR ARCHIVED. Refused rather than overcharge.`,
        );
        return json({ error: "discount_unavailable", code: want }, 409);
      }
    }

    /* What each line cost before any discount, in order. The webhook splits
       the amount actually paid across the ledger rows in these proportions,
       so a gift's two rows record $150 and $112.50 rather than two halves. */
    form.set("metadata[cents]", lines.map((l) => l.cents).join(","));

    lines.forEach((l, i) => {
      form.set(`line_items[${i}][quantity]`, "1");
      form.set(`line_items[${i}][price_data][currency]`, "usd");
      form.set(`line_items[${i}][price_data][unit_amount]`, String(l.cents));
      form.set(`line_items[${i}][price_data][product_data][name]`, l.label);
      form.set(`line_items[${i}][price_data][product_data][metadata][slug]`, l.slug);
    });

    const r = await stripe("checkout/sessions", form);
    if (!r.ok) {
      console.error("Stripe session failed", r.status, JSON.stringify(r.data?.error || r.data));
      return json({ error: "stripe_failed", detail: r.data?.error?.message || null }, 502);
    }

    return json({ url: r.data.url, code: appliedCode });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
