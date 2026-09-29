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

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const SITE = "https://quintaand.co";
const ORIGINS = [SITE, "http://localhost:8137"];   // 8137 is the local preview

/* The price of record. Deliberately not fetched from classes.js: a checkout
   must not depend on a file that a copy edit could reshape, and it must not
   trust the browser. Keep in step with classes.js - these are the classes the
   site currently shows as open, and every one of them has a $0 redeem twin in
   Cal.com to book it with afterwards. */
const PRICES: Record<string, { cents: number; name: string }> = {
  "bookkeeping-2":      { cents:  9900, name: "Bookkeeping II — Prep for your bookkeeper" },
  "module-1":           { cents: 15000, name: "Module 1 — Claude for beginners" },
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

   The minimum is read back rather than written down here on purpose. Stripe
   refuses a session outright if it carries a code the cart is too small for,
   which would show the buyer "we couldn't open the payment page" and lose
   the sale. Today every two-class cart clears $249 and every three-class
   cart clears $424 exactly - but add one cheaper class to the catalogue and
   that stops being true. Comparing against the live value means that day
   costs a smaller discount, not a broken checkout.

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
    const isGift = String(body?.offer || "") === "gift";

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("cancel_url", `${SITE}/fork-femme-foundations.html`);

    type Line = { slug: string; cents: number; label: string };
    let lines: Line[] = [];
    let appliedCode: string | null = null;

    if (isGift) {
      /* One for her, one at 75% for someone else. The recipient's email is
         optional on purpose - the landing page says the voucher may well be
         for the buyer herself to hand over, so a blank one means both links
         go to the payer. */
      const mine = String(body?.slug || "");
      const gift = String(body?.gift || "");
      if (!PRICES[mine] || !PRICES[gift]) {
        return json({ error: "unknown_class" }, 400);
      }
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
         on its own Cal.com page, not here. Seven is every class there is. */
      const slugs: string[] = Array.from(new Set<string>(raw.map((s) => String(s))))
        .filter((s) => Object.prototype.hasOwnProperty.call(PRICES, s));
      if (slugs.length < 2) return json({ error: "pick_at_least_two" }, 400);
      if (slugs.length > 7) return json({ error: "too_many" }, 400);

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
      } else if (want) {
        /* Sell it rather than fail, but make it impossible to miss: she is
           being charged full price for a cart that was promised a discount,
           and only this log will say why. Leave the box on so she can still
           type a code she has from somewhere else. */
        console.error(
          p
            ? `${want} NOT APPLIED — cart is ${total} and the code needs ${p.min}. Selling ${slugs.length} classes at full price.`
            : `PROMOTION CODE ${want} NOT FOUND OR ARCHIVED — selling ${slugs.length} classes at full price.`,
        );
        form.set("allow_promotion_codes", "true");
      }
    }

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
