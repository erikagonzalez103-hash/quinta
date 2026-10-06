// Meta Conversions API: tells Meta about a purchase from the server.
//
// WHY FROM THE SERVER
// Meta's pixel only sees what happens on quintaand.co. Classes and bundles are
// paid inside Cal.com, which on our plan cannot send a buyer back to a
// thank-you page (redirect-on-booking is a Teams feature), so the pixel never
// saw a single purchase - 0 Purchase events Sep 6 - Oct 1 against a real sale.
// Every purchase already reaches us here, so we tell Meta directly:
//   stripe-webhook      October 21, Choose Your Own, gifts   (real amount paid)
//   cal-bundle-welcome  Cal.com classes and bundles           (list price below)
//
// COUNTED ONCE. event_id is the Stripe Checkout Session id or the Cal.com
// booking uid. The browser sends the same id on our own return pages
// (oct21.html, bundle/?b=custom|gift - js/meta.js), and Meta keeps one of the
// two. A retried webhook resends the same id, which Meta also drops.
//
// SECRETS (Supabase > Edge Functions > Secrets):
//   META_CAPI_TOKEN        from Events Manager > Quinta Website > Settings >
//                          Conversions API > Generate access token. Without it
//                          nothing is sent - every call is a quiet no-op.
//   META_TEST_EVENT_CODE   optional, only while testing: the TEST code from
//                          Events Manager > Test events. Remove it afterwards,
//                          or real purchases keep landing in the test view.
//
// Never throws: a purchase is real whether or not Meta heard about it.

const PIXEL_ID = "1179541285251913";          // dataset "Quinta Website"
const GRAPH = "https://graph.facebook.com/v23.0";

/* List prices for what Cal.com sells, by event slug. Cal.com takes the
   payment, so this is what a Cal.com purchase is valued at. Bundles are their
   bundle price. Keep in step with classes.js and the BUNDLES block in
   fork-femme-foundations.html (and js/meta.js, which the browser uses). */
export const CAL_PRICES: Record<string, { value: number; name: string }> = {
  "entity-setup":       { value: 175, name: "Entity setup" },
  "banking":            { value:  99, name: "Banking" },
  "insurance":          { value: 175, name: "Insurance" },
  "bookkeeping-1":      { value:  99, name: "Bookkeeping I — Set up QuickBooks" },
  "bookkeeping-2":      { value:  99, name: "Bookkeeping II — Prep for your bookkeeper" },
  "taxes":              { value: 250, name: "Taxes" },
  "pricing":            { value: 250, name: "Pricing" },
  "contracts":          { value: 175, name: "Contracts" },
  "first-hire":         { value: 175, name: "Your first hire" },
  "certification":      { value: 299, name: "Get certified — WBE / MBE / DBE" },
  "financial-planning": { value: 250, name: "Investing — How to pay yourself first" },
  "legacy-planning":    { value: 299, name: "Legacy planning" },
  "trademarks":         { value: 299, name: "Trademarks" },
  "funding":            { value: 175, name: "Funding" },
  "brand-101":          { value: 175, name: "Brand 101" },
  "module-1":           { value: 150, name: "Module 1: Your First AI Workflow" },
  "module-2":           { value: 200, name: "Module 2 — Build your AI assistant" },
  "module-3":           { value: 299, name: "Module 3 — Real databases & automation" },
  "landlord":           { value: 175, name: "Intro to Real Estate Management: So You Want to Be a Landlord" },
  "rental-management":  { value: 250, name: "Owning it without doing it all" },
  "rental-growth":      { value: 299, name: "Grow it and build your team" },
  "get-started-fff":    { value: 212, name: "Get started (bundle)" },
  "keep-the-books-fff": { value: 168, name: "Keep the books (bundle)" },
  "build-to-last-fff":  { value: 990, name: "Build to last (bundle)" },
  "the-practice-fff":   { value: 485, name: "The Practice (bundle)" },
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export type MetaPurchase = {
  eventId: string;              // Stripe session id or Cal.com booking uid
  value: number;                // dollars
  contentIds: string[];         // class / bundle slugs
  contentName: string;
  sourceUrl: string;            // the page the purchase belongs to
  email?: string;
  name?: string;                // full name; split into first / last for matching
  fbp?: string;                 // _fbp cookie, carried through checkout metadata
  fbc?: string;                 // _fbc cookie (set when she arrived from an ad)
  userAgent?: string;
  eventTime?: number;           // seconds; defaults to now
};

export async function metaPurchase(p: MetaPurchase): Promise<string> {
  try {
    const token = Deno.env.get("META_CAPI_TOKEN");
    if (!token) { console.log(`Meta: no META_CAPI_TOKEN, Purchase ${p.eventId} not sent`); return "skipped"; }
    if (!p.eventId || !(p.value > 0)) return "skipped (free or no id)";

    const parts = norm(p.name).split(/\s+/).filter(Boolean);
    const user: Record<string, unknown> = { country: [await sha256("us")] };
    if (p.email) user.em = [await sha256(norm(p.email))];
    if (parts[0]) user.fn = [await sha256(parts[0])];
    if (parts.length > 1) user.ln = [await sha256(parts[parts.length - 1])];
    if (p.fbp) user.fbp = p.fbp;
    if (p.fbc) user.fbc = p.fbc;
    if (p.userAgent) user.client_user_agent = p.userAgent;

    const body: Record<string, unknown> = {
      access_token: token,
      data: [{
        event_name: "Purchase",
        event_time: p.eventTime || Math.floor(Date.now() / 1000),
        event_id: p.eventId,
        action_source: "website",
        event_source_url: p.sourceUrl,
        user_data: user,
        custom_data: {
          currency: "USD",
          value: Math.round(p.value * 100) / 100,
          content_ids: p.contentIds,
          content_name: p.contentName,
          content_type: "product",
        },
      }],
    };
    const test = Deno.env.get("META_TEST_EVENT_CODE");
    if (test) body.test_event_code = test;

    const r = await fetch(`${GRAPH}/${PIXEL_ID}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) { console.error(`Meta: Purchase ${p.eventId} refused`, r.status, text); return `refused ${r.status}`; }
    console.log(`Meta: Purchase ${p.eventId} sent ($${p.value})${test ? " [test]" : ""}`);
    return "sent";
  } catch (e) {
    console.error("Meta: Purchase threw", e);
    return "threw";
  }
}
