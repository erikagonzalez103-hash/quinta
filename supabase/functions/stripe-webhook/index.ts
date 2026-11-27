// Edge Function: stripe-webhook
//
// Stripe -> the enrollments ledger, and the buyer's inbox.
//
// WHY THIS EXISTS
// A choose-your-own purchase is paid on Stripe, not Cal.com, so none of the
// Cal.com webhooks fire for it. Without this, a woman could pay for three
// classes and nothing at all would happen: no ledger row, no booking links,
// no way for her to get what she bought.
//
// It is the Stripe-side twin of cal-bundle-welcome, and writes the same
// shape of rows so that the QR check-in on class day closes her entitlement
// the same way.
//
// WHAT IT LISTENS FOR
// checkout.session.completed only. A session that expires or is abandoned
// never reaches here, which is correct - she has not paid.
//
// SHORT-LIVED BY DESIGN. Delete with the Bookwhen migration after 21 October.
//
// SECRETS: STRIPE_WEBHOOK_SECRET (the signing secret Stripe shows when you add
//          the endpoint), RESEND_API_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected.
//
// Deploy with --no-verify-jwt - Stripe cannot send a Supabase JWT, and the
// signature check below is what authenticates the caller.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { metaPurchase } from "../_shared/meta.ts";
import { OCT21, SEATS, sessions as oct21Sessions, confirmStudent, tellTeacher, attendingFor, salesClosed, type Session } from "../_shared/oct21.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const BCC = "erika@quintaand.co";
const CAL = "https://cal.com/quintaandco/";

const CLASS_NAMES: Record<string, string> = {
  "bookkeeping-1": "Bookkeeping I — Set up QuickBooks",
  "bookkeeping-2": "Bookkeeping II — Prep for your bookkeeper",
  "module-1": "Module 1: Your First AI Workflow",
  "module-2": "Module 2 — Build your AI assistant",
  "brand-101": "Brand 101",
  "financial-planning": "Investing — How to pay yourself first",
  "certification": "Get certified — WBE / MBE / DBE",
  "trademarks": "Trademark Matriarch",
  "entity-setup": "Entity Building",
  "taxes": "Read Your Own Return",
  "tax-strategy": "Tax Strategy",
  "landlord": "Intro to Real Estate Management: So You Want to Be a Landlord",
  "module-3": "Module 3 — Real databases & automation",
  "rental-management": "Owning it without doing it all",
  "rental-growth": "Grow it and build your team",
};

/* Stripe signs the raw body as `t=<unix>,v1=<hex>` over "<t>.<body>".
   Constant-time compare, and reject anything older than five minutes so a
   captured request cannot be replayed later. */
async function signatureOk(raw: string, header: string | null): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET || !header) return false;

  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v;
    if (k === "v1") v1.push(v);
  }
  if (!t || !v1.length) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > 300) {
    console.error("Rejected: timestamp outside the five-minute window");
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
  const mine = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  return v1.some((theirs) => {
    if (mine.length !== theirs.length) return false;
    let diff = 0;
    for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ theirs.charCodeAt(i);
    return diff === 0;
  });
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

/* ---------------------------------------------------- bank payments ----- */

// What a session was for, from the metadata stripe-checkout wrote.
function orderLines(s: any) {
  const slugs = String(s?.metadata?.slugs || "").split(",").map((x: string) => x.trim()).filter(Boolean);
  const offer = String(s?.metadata?.offer || "");
  const sessions = String(s?.metadata?.sessions || "").split(",").map((x: string) => x.trim()).filter(Boolean);
  const gift = String(s?.metadata?.gift_slug || "").trim();
  const lines = slugs.map((slug: string, i: number) => ({ slug, session: offer === "oct21" ? (sessions[i] || null) : null, gift: false }));
  if (gift) lines.push({ slug: gift, session: null, gift: true });
  return { offer, lines };
}
const nameOf = (slug: string) => CLASS_NAMES[slug] || slug;
const PENDING_TAG = ":pending:";

/* Placeholder rows while a bank payment clears: status 'pending', so the
   Monday headcount can list her but no seat is taken and no sale counted.
   order_ref "<session>:pending:<n>" never collides with the real rows. */
async function writePending(s: any) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  const { offer, lines } = orderLines(s);
  const email = String(s?.customer_details?.email || "").trim().toLowerCase();
  if (!email || !lines.length) return;
  const rows = lines.map((l, i) => ({
    student_name: String(s?.customer_details?.name || "").trim() || null,
    student_email: email,
    class_slug: l.slug,
    class_name: nameOf(l.slug),
    source: l.gift ? "gift" : lines.length > 1 ? "multi-discount" : "single",
    bundle_key: null,
    order_ref: `${s.id}${PENDING_TAG}${i}`,
    amount_cents: null,
    ref_code: String(s?.metadata?.ref || "").trim() || null,
    status: "pending",
    session_on: offer === "oct21" ? OCT21 : null,
    session_id: l.session,
    notes: "Bank payment processing",
    utm_source: String(s?.metadata?.utm_source || "") || null,
    utm_medium: String(s?.metadata?.utm_medium || "") || null,
    utm_campaign: String(s?.metadata?.utm_campaign || "") || null,
    utm_content: String(s?.metadata?.utm_content || "") || null,
  }));
  try {
    const r = await db("enrollments", { method: "POST", body: JSON.stringify(rows) });
    if (!r.ok && r.status !== 409) console.error("pending insert failed", r.status, await r.text());
  } catch (e) { console.error("pending insert threw", e); }
}

async function clearPending(sessionId: string) {
  if (!SUPABASE_URL || !SERVICE_KEY || !sessionId) return;
  try {
    const r = await db(`enrollments?order_ref=like.${encodeURIComponent(sessionId + PENDING_TAG)}*&status=eq.pending`, { method: "DELETE" });
    if (!r.ok) console.error("pending clear failed", r.status, await r.text());
  } catch (e) { console.error("pending clear threw", e); }
}

/* Her email: "processing" when the bank payment starts, "didn't go
   through" if it fails. Erika is copied on both. */
async function bankEmail(kind: "pending" | "failed", s: any) {
  if (!RESEND_API_KEY) return;
  const email = String(s?.customer_details?.email || "").trim();
  const first = String(s?.customer_details?.name || "").trim().split(/\s+/)[0] || "there";
  const { offer, lines } = orderLines(s);
  const what = lines.map((l) => nameOf(l.slug) + (l.gift ? " (the gift)" : "")).join(", ");
  const again = offer === "oct21" ? "https://quintaand.co/oct21.html" : offer === "gift" ? "https://quintaand.co/gift.html"
    : offer === "shopsmall" ? "https://quintaand.co/shopsmall/" : "https://quintaand.co/choose.html";
  const wrapMail = (inner: string) => `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:520px">${inner}` +
    `<p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co. · Dallas, Texas</p></div>`;
  const msg = kind === "pending"
    ? {
        subject: "Thank you — your order is in, your bank payment is processing",
        html: wrapMail(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
          <p style="margin:0 0 16px">Thank you — we've got your order for <strong>${esc(what)}</strong>.</p>
          <p style="margin:0 0 16px">You paid by bank, which takes a few business days to clear. <strong>The moment it does, we'll email your
            confirmation</strong>${offer === "oct21" ? " with your classes and times for October 21" : " with your booking links"}. There's nothing else you need to do.</p>
          <p style="margin:0 0 16px;font-size:14px;color:#5A5E55">Questions? Just reply to this email.</p>`),
        text: `Hi ${first},\n\nThank you - we've got your order for ${what}.\n\nYou paid by bank, which takes a few business days to clear. `
          + `The moment it does, we'll email your confirmation. There's nothing else you need to do.\n\nQuestions? Just reply.\n\nQuinta & Co.\n`,
      }
    : {
        subject: "Your bank payment didn't go through",
        html: wrapMail(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
          <p style="margin:0 0 16px">Your bank payment for <strong>${esc(what)}</strong> didn't go through, so your order isn't complete and
            you haven't been charged.</p>
          <p style="margin:0 0 16px">You're welcome to try again — paying by card, Apple Pay or Google Pay confirms straight away:
            <a href="${again}" style="color:#4F6B5C;font-weight:bold">${again.replace("https://", "")}</a></p>
          <p style="margin:0 0 16px;font-size:14px;color:#5A5E55">If something's not right, just reply and we'll sort it out.</p>`),
        text: `Hi ${first},\n\nYour bank payment for ${what} didn't go through, so your order isn't complete and you haven't been charged.\n\n`
          + `You're welcome to try again - card, Apple Pay or Google Pay confirm straight away: ${again}\n\nQuinta & Co.\n`,
      };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: SEND_FROM, to: email ? [email] : [BCC], bcc: email ? [BCC] : undefined, reply_to: BCC, ...msg }),
    });
    if (!r.ok) console.error("bank email failed", r.status, await r.text());
  } catch (e) { console.error("bank email threw", e); }
}

/* ------------------------------------------- BOOKS BEFORE BUBBLY ------- */

const BBB_DAY = "2026-12-15";
const BBB_SEATS = 20;
const BBB_WARN = 18;           // Erika's alert line (bbb-seat-watch used the same)
// UTC times for calendar links; Dallas is UTC-6 in December.
const BBB_CLASS: Record<string, { name: string; when: string; from: string; to: string; teacher: string }> = {
  "bookkeeping-1": { name: "Bookkeeping 1", when: "10:00 to 11:30 AM",
    from: "20261215T160000Z", to: "20261215T173000Z", teacher: "Tara Johnson" },
  "bookkeeping-2": { name: "Bookkeeping 2", when: "11:30 AM to 1:00 PM",
    from: "20261215T173000Z", to: "20261215T190000Z", teacher: "Tara Johnson" },
  "year-end-tax":  { name: "Year-End Tax Readiness", when: "1:30 to 3:00 PM",
    from: "20261215T193000Z", to: "20261215T210000Z", teacher: "Guadalupe Barraza, CPA" },
};
const BBB_WHERE = "kiln coworking, Preston Hollow, Dallas";
// Same fallback cal-instructor-notify keeps for the one class with no portal dates.
const TEACHER_FALLBACK: Record<string, { instructor_email: string; instructor_name: string }> = {
  "year-end-tax": { instructor_email: "lupe@gbarrazacpa.com", instructor_name: "Guadalupe Barraza" },
};
const TEST_BUYERS = ["erika@quintaand.co", "hello@quintaand.co"];

async function bbbTeacher(slug: string): Promise<{ instructor_email: string; instructor_name: string } | null> {
  const base = `class_sessions?select=instructor_email,instructor_name&class_slug=eq.${encodeURIComponent(slug)}`;
  for (const q of [`${base}&session_date=eq.${BBB_DAY}&limit=1`, `${base}&limit=1`]) {
    try {
      const r = await db(q);
      if (!r.ok) continue;
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]?.instructor_email) return rows[0];
    } catch (e) { console.error("teacher lookup failed", e); }
  }
  return TEACHER_FALLBACK[slug] || null;
}

function calLink(c: { name: string; from: string; to: string }, online: boolean): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${c.name} — Books Before Bubbly (Quinta & Co.)`,
    dates: `${c.from}/${c.to}`,
    details: online ? "Live online. Your teacher emails you the video link before class."
                    : "Books Before Bubbly at kiln Preston Hollow. Bring your laptop.",
    location: online ? "Online" : BBB_WHERE,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

async function bbbBooked(o: {
  slugs: string[]; name: string; email: string; first: string; online: boolean; bundle: string | null;
  orderId: string; ref: string | null; adTags: Record<string, string | null>;
  share: (i: number) => number | null;
}): Promise<{ ok: boolean; ledger: string }> {
  const attending = o.online ? "online" : "in-person";
  const rows = o.slugs.map((slug, i) => ({
    student_name: o.name || null,
    student_email: o.email,
    class_slug: slug,
    class_name: `${BBB_CLASS[slug]?.name || slug} (Books Before Bubbly)`,
    source: o.bundle ? "bundle" : "single",
    bundle_key: o.bundle,
    order_ref: `${o.orderId}:${slug}`,
    amount_cents: o.share(i),
    ref_code: o.ref,
    status: "booked",
    session_on: BBB_DAY,
    session_id: null,
    attending,
    notes: "Books Before Bubbly, paid on Stripe",
    ...o.adTags,
  }));

  let ledger = "written";
  try {
    const r = await db("enrollments", { method: "POST", body: JSON.stringify(rows) });
    if (r.status === 409) ledger = "already recorded";
    else if (!r.ok) { ledger = "insert failed"; console.error("bbb insert failed", r.status, await r.text()); }
  } catch (e) { ledger = "threw"; console.error("bbb ledger threw", e); }
  const fresh = ledger === "written";

  async function mail(to: string[], subject: string, html: string, text: string, extra: Record<string, unknown> = {}) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: SEND_FROM, to, subject, html, text, ...extra }),
      });
      if (!r.ok) console.error("bbb email failed", to.join(","), r.status, await r.text());
      return r.ok;
    } catch (e) { console.error("bbb email threw", e); return false; }
  }
  const wrapB = (inner: string) => `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:520px">${inner}` +
    `<p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co. · Dallas, Texas</p></div>`;

  /* Seats after this sale, and Erika told when a class is nearly full or
     when the ledger write failed (she has paid; the rows must be added). */
  const counts: string[] = [];
  for (const slug of o.slugs) {
    try {
      const r = await db(`enrollments?select=id&session_on=eq.${BBB_DAY}&class_slug=eq.${encodeURIComponent(slug)}&status=in.(booked,taken)`,
        { headers: { Prefer: "count=exact" } });
      const n = Number((r.headers.get("content-range") || "").split("/")[1] || 0);
      if (n >= BBB_WARN) counts.push(`${BBB_CLASS[slug]?.name || slug}: ${n} of ${BBB_SEATS}`);
    } catch (e) { console.error("bbb count failed", e); }
  }
  if (fresh && counts.length || (ledger !== "written" && ledger !== "already recorded")) {
    await mail([BCC], counts.length ? `Books Before Bubbly filling up — ${counts.join("; ")}` : `Books Before Bubbly seat not recorded — ${o.orderId}`,
      wrapB(`<p>${esc(o.name || o.email)} (${esc(o.email)}) just booked ${esc(o.slugs.map((s) => BBB_CLASS[s]?.name || s).join(" + "))}, ${attending}.</p>`
        + (counts.length ? `<p><strong>Seats taken:</strong> ${esc(counts.join("; "))}. To stop sales for a class, ask Claude.</p>` : "")
        + (ledger !== "written" && ledger !== "already recorded" ? `<p><strong>The ledger write failed (${esc(ledger)}).</strong> She has paid and been confirmed. Add the rows by hand, or ask Claude.</p>` : "")),
      `${o.name || o.email} booked ${o.slugs.join(" + ")}, ${attending}.\n${counts.join("\n")}\nLedger: ${ledger}\n`);
  }

  // Her confirmation.
  const list = o.slugs.map((slug) => {
    const c = BBB_CLASS[slug] || { name: slug, when: "", from: "", to: "", teacher: "" };
    return `<li style="margin:0 0 12px"><strong>${esc(c.name)}</strong>, ${esc(c.when)}, with ${esc(c.teacher)}<br>`
      + `<a href="${calLink(c, o.online)}" style="color:#4F6B5C;font-size:14px">Add to Google Calendar</a></li>`;
  }).join("");
  const listText = o.slugs.map((slug) => {
    const c = BBB_CLASS[slug] || { name: slug, when: "", teacher: "" };
    return `- ${c.name}, ${c.when}, with ${c.teacher}`;
  }).join("\n");
  const where = o.online
    ? `<p style="margin:0 0 16px"><strong>You're joining online.</strong> Your teacher will email you the video link before class.</p>`
    : `<p style="margin:0 0 16px"><strong>Where:</strong> ${esc(BBB_WHERE)}. Bring your laptop, and the bubbly is on us after.</p>`;
  const okStudent = await mail([o.email], "You're in: Books Before Bubbly, Tuesday, December 15",
    wrapB(`<p style="margin:0 0 16px">Hi ${esc(o.first)},</p>
      <p style="margin:0 0 16px">Thank you. You're booked for <strong>Books Before Bubbly</strong> on <strong>Tuesday, December 15</strong>:</p>
      <ul style="margin:0 0 18px;padding-left:20px">${list}</ul>
      ${where}
      <p style="margin:0 0 16px;font-size:14px;color:#5A5E55">Need to change something? Just reply to this email.
        <a href="https://quintaand.co/policies.html" style="color:#5A5E55">Our policies</a>.</p>`),
    `Hi ${o.first},\n\nThank you. You're booked for Books Before Bubbly on Tuesday, December 15:\n\n${listText}\n\n`
      + (o.online ? "You're joining online. Your teacher will email you the video link before class.\n"
                  : `Where: ${BBB_WHERE}. Bring your laptop.\n`)
      + `\nNeed to change something? Just reply to this email.\n\nQuinta & Co.\n`,
    { bcc: o.email === BCC ? undefined : [BCC], reply_to: BCC });

  /* Each teacher, once per new booking (a retried webhook doesn't repeat
     it). Reply-to is the student, so an online student's link is one reply.
     A test purchase with Erika's own address goes to Erika only, marked. */
  if (fresh) {
    const isTest = TEST_BUYERS.includes(o.email);
    for (const slug of o.slugs) {
      const c = BBB_CLASS[slug] || { name: slug, when: "" };
      const t = await bbbTeacher(slug);
      const to = isTest || !t ? BCC : t.instructor_email;
      const hi = (t?.instructor_name || "").split(" ")[0] || "there";
      const join = o.online
        ? `<p style="margin:0 0 16px;padding:12px 14px;background:#EEF2EC;border-left:3px solid #4F6B5C"><strong>She's joining online.</strong>
             Reply to this email with your video link — the reply goes straight to her.</p>`
        : `<p style="margin:0 0 16px"><strong>Joining:</strong> in person at kiln</p>`;
      await mail([to], `${isTest ? "[TEST] " : ""}New booking${o.online ? " (online)" : ""} — ${c.name}, Books Before Bubbly, Tue Dec 15`,
        wrapB(`${isTest ? `<p style="margin:0 0 16px;padding:12px 14px;background:#FFF6E0;border-left:3px solid #CAA871"><strong>Test purchase</strong>, sent to you only. Would have gone to ${esc(t?.instructor_email || "nobody found")}.</p>` : ""}
          <p style="margin:0 0 16px">Hi ${esc(hi)},</p>
          <p style="margin:0 0 16px"><strong>${esc(o.name || o.email)}</strong> just booked <strong>${esc(c.name)}</strong> at Books Before Bubbly.</p>
          ${join}
          <p style="margin:0 0 6px"><strong>When:</strong> Tuesday, December 15, ${esc(c.when)} (Dallas time)</p>
          <p style="margin:0 0 16px"><strong>Her email:</strong> ${esc(o.email)}</p>`),
        `Hi ${hi},\n\n${o.name || o.email} just booked ${c.name} at Books Before Bubbly.\n`
          + (o.online ? "SHE'S JOINING ONLINE - reply with your video link.\n" : "Joining: in person at kiln\n")
          + `When: Tuesday, December 15, ${c.when}\nHer email: ${o.email}\n`,
        { reply_to: o.email, cc: to === BCC ? undefined : [BCC] });
    }
  }
  return { ok: okStudent, ledger };
}

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });

  try {
    const raw = await req.text();
    if (!(await signatureOk(raw, req.headers.get("stripe-signature")))) {
      console.error("Rejected: bad or missing stripe-signature. Does STRIPE_WEBHOOK_SECRET match the endpoint's signing secret?");
      return json({ error: "bad signature" }, 401);
    }

    const event = JSON.parse(raw);
    const type = String(event?.type || "");
    const s = event?.data?.object ?? {};

    /* BANK PAYMENTS (Erika, 6 Oct). Stripe's Link offers "Bank" alongside
       cards. A bank payment finishes checkout ("completed") before the money
       arrives, and can take a few business days to clear:
         completed, payment_status "unpaid"  -> write 'pending' rows (visible,
           no seat, not a sale) and tell her it's processing
         async_payment_succeeded             -> the money is here: remove the
           pending rows and book exactly as a card payment does (below)
         async_payment_failed                -> remove the pending rows and
           tell her kindly, with a link to try again
       The two async events must be ticked on the Stripe webhook endpoint
       (Developers > Webhooks), or Stripe never sends them. */
    if (type === "checkout.session.async_payment_failed") {
      await clearPending(String(s?.id || ""));
      await bankEmail("failed", s);
      return json({ ok: true, bank: "failed" });
    }
    if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
      return json({ skipped: `not a completed checkout: ${type}` });
    }
    if (s?.payment_status !== "paid" && s?.payment_status !== "no_payment_required") {
      await writePending(s);
      await bankEmail("pending", s);
      return json({ ok: true, bank: "pending" });
    }
    // Paid. If this is a bank payment arriving, its placeholders go first.
    await clearPending(String(s?.id || ""));

    const slugs =String(s?.metadata?.slugs || "")
      .split(",").map((x: string) => x.trim()).filter(Boolean);
    /* A gift carries a second class for a second person. Her email is
       optional: the offer is written so the buyer may be handing the voucher
       over herself, and in that case both links go to the payer with the
       gifted one clearly marked. In the Black Friday sale a gift can be the
       whole order - nothing for the buyer herself - so no slugs is fine
       when there is a gift. */
    const giftSlug = String(s?.metadata?.gift_slug || "").trim();
    if (!slugs.length && !giftSlug) {
      console.error(`Session ${s?.id} completed with no slugs in metadata - nothing to grant.`);
      return json({ error: "no slugs" }, 422);
    }
    const isSale = String(s?.metadata?.offer || "") === "shopsmall";
    // Emails are stored lower-case everywhere: the Cal.com redeem matches them
    // exactly, and "Jane@Gmail.com" must find the row "jane@gmail.com" booked.
    const giftEmail = String(s?.metadata?.gift_email || "").trim().toLowerCase();
    const giftName = String(s?.metadata?.gift_name || "").trim();

    const email = String(s?.customer_details?.email || "").trim().toLowerCase();
    const name = String(s?.customer_details?.name || "").trim();
    if (!email) {
      console.error(`Session ${s?.id} completed with no email - cannot record or send.`);
      return json({ error: "no email" }, 422);
    }
    const first = name.split(/\s+/)[0] || "there";
    const paid = typeof s?.amount_total === "number" ? s.amount_total : null;

    const ref = String(s?.metadata?.ref || "").trim() || null;
    const orderId = String(s?.id || "");
    /* Which ad sent her (stripe-checkout copies the utm tags into metadata).
       Spread onto every row, so all rows carry the same keys either way. */
    const adTags = {
      utm_source:   String(s?.metadata?.utm_source || "") || null,
      utm_medium:   String(s?.metadata?.utm_medium || "") || null,
      utm_campaign: String(s?.metadata?.utm_campaign || "") || null,
      utm_content:  String(s?.metadata?.utm_content || "") || null,
    };

    /* Tell Meta about the purchase - the real amount paid, keyed on the
       session id so the browser's Purchase on the return page (same id)
       and any Stripe retry are counted once. See _shared/meta.ts. Sent here,
       before the emails, so a failed email (which asks Stripe to retry)
       never stops it; a retry resends the same id and Meta drops it. */
    {
      const offer = String(s?.metadata?.offer || "");
      const ids = giftSlug ? slugs.concat([giftSlug]) : slugs;
      await metaPurchase({
        eventId: orderId,
        value: paid !== null ? paid / 100 : 0,
        contentIds: ids,
        contentName: offer === "oct21" ? "October 21 classes" : offer === "gift" ? "Buy one, gift one"
          : offer === "shopsmall" ? "Black Friday sale" : offer === "bbb" ? "Books Before Bubbly"
          : "Choose your own classes",
        sourceUrl: offer === "oct21" ? "https://quintaand.co/oct21.html"
          : offer === "shopsmall" ? "https://quintaand.co/shopsmall/"
          : offer === "bbb" ? "https://quintaand.co/books-before-bubbly/" : "https://quintaand.co/bundle/",
        email, name,
        fbp: String(s?.metadata?.fbp || "") || undefined,
        fbc: String(s?.metadata?.fbc || "") || undefined,
        userAgent: String(s?.metadata?.ua || "") || undefined,
        eventTime: typeof s?.created === "number" ? s.created : undefined,
      });
    }

    /* What she actually paid, split across the rows in proportion to what
       each line cost before any discount. The checkout function writes those
       list prices into metadata.cents in line order - her classes first, the
       gift last. An even split would record a gift's $150 and $112.50 as two
       halves of $262.50, which is right in total and wrong on both rows.
       Falls back to an even split for a session made before this existed. */
    const list = String(s?.metadata?.cents || "").split(",").map(Number)
      .filter((n: number) => Number.isFinite(n) && n > 0);
    const lineCount = slugs.length + (giftSlug ? 1 : 0);
    const listTotal = list.reduce((t: number, n: number) => t + n, 0);
    function share(i: number): number | null {
      if (paid === null) return null;
      if (list.length === lineCount && listTotal > 0) {
        return Math.round(paid * list[i] / listTotal);
      }
      return Math.round(paid / lineCount);
    }

    /* --------------------------------------------- 21 OCTOBER, paid ------
       A seat on the day, bought on oct21.html. Unlike the other offers this
       books a real session, so each row is 'booked' with its session_id - that
       is what oct21_sessions() counts to decide how many seats are left.

       order_ref carries the session id so two sessions in one order can never
       collide on the (order_ref, class_slug) unique index, while a retried
       webhook for the same order still lands on it and is treated as done. */
    if (String(s?.metadata?.offer || "") === "oct21") {
      const ids = String(s?.metadata?.sessions || "").split(",").map((x: string) => x.trim()).filter(Boolean);
      const attending = s?.metadata?.attending === "online" ? "online" : "in-person";
      if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "no database credentials" }, 500);
      if (ids.length !== slugs.length) {
        console.error(`Order ${orderId}: ${ids.length} sessions but ${slugs.length} classes in metadata`);
        return json({ error: "metadata mismatch" }, 422);
      }

      // Only for names and times in the emails; the rows are written either way.
      const day: Session[] = await oct21Sessions(SUPABASE_URL, SERVICE_KEY).catch(() => [] as Session[]);
      const byId = new Map<string, Session>(day.map((x) => [x.session_id, x] as [string, Session]));
      // An online-only session is online for her whatever she picked for the day.
      const seats = ids.map((id: string, i: number) => ({
        session_id: id,
        class_name: byId.get(id)?.class_name || CLASS_NAMES[slugs[i]] || slugs[i],
        start_time: String(byId.get(id)?.start_time || "00:00"),
        online: attendingFor(byId.get(id)?.format, attending) === "online",
      }));

      const oRows = ids.map((id: string, i: number) => ({
        student_name: name || null,
        student_email: email,
        class_slug: slugs[i],
        class_name: seats[i].class_name,
        source: ids.length > 1 ? "multi-discount" : "single",
        bundle_key: null,
        order_ref: `${orderId}:${id}`,
        amount_cents: share(i),
        ref_code: ref,
        status: "booked",
        session_on: OCT21,
        session_id: id,
        attending: seats[i].online ? "online" : "in-person",
        notes: "Booked on oct21.html",
        ...adTags,
      }));

      let ledger21 = "written";
      try {
        const res = await db("enrollments", { method: "POST", body: JSON.stringify(oRows) });
        if (res.status === 409) ledger21 = "already recorded";
        else if (!res.ok) { ledger21 = "insert failed"; console.error("oct21 insert failed", res.status, await res.text()); }
      } catch (e) { ledger21 = "threw"; console.error("oct21 ledger threw", e); }

      /* The seat check after payment. Checkout refuses a full session, but
         two women can be at checkout for the last seat at once, and Stripe
         takes both payments. Nobody is turned away by a machine - Erika is
         told, and decides between an extra chair and a refund. */
      const oversold: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        const r = await db(
          `enrollments?session_id=eq.${encodeURIComponent(ids[i])}&status=in.(booked,taken)&select=id`,
          { headers: { Prefer: "count=exact" } });
        const total = Number((r.headers.get("content-range") || "").split("/")[1] || 0);
        if (total > SEATS) oversold.push(`${seats[i].class_name} at ${seats[i].start_time.slice(0, 5)} (${total} of ${SEATS})`);
      }

      if (!RESEND_API_KEY) return json({ error: "no email service", ledger: ledger21 }, 500);

      if (ledger21 === "insert failed" || ledger21 === "threw" || oversold.length) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: SEND_FROM, to: [BCC],
            subject: oversold.length ? `October 21 oversold — ${oversold.join("; ")}` : `October 21 seat not recorded — order ${orderId}`,
            text: `Order ${orderId}, ${name || "(no name)"} <${email}>\n`
              + `Classes: ${seats.map((x) => x.class_name).join(", ")}\n`
              + (oversold.length ? `\nOVER THE ${SEATS}-SEAT LIMIT: ${oversold.join("; ")}\n`
                + `She has paid and been confirmed as normal - you said an extra chair is fine. Just make sure the room has one.\n` : "")
              + (ledger21 !== "written" && ledger21 !== "already recorded" ? `\nThe ledger write failed (${ledger21}). Add the rows by hand or ask Claude.\n` : ""),
          }),
        }).catch((e) => console.error("alert to Erika failed", e));
      }

      const okStudent = await confirmStudent(RESEND_API_KEY, email, name, seats, attending);
      for (const seat of seats) {
        await tellTeacher(RESEND_API_KEY, SUPABASE_URL, SERVICE_KEY, seat, { name, email },
                          seat.online ? "online" : "in-person", true);
      }
      // Her confirmation is the one that matters; without it she has paid and
      // has nothing. Ask Stripe to retry. The ledger write is safe to repeat.
      if (!okStudent) return json({ error: "confirmation email failed", ledger: ledger21 }, 500);
      return json({ ok: true, oct21: true, ledger: ledger21, seats: ids.length, oversold });
    }

    /* ------------------------------------ BOOKS BEFORE BUBBLY, paid ------
       Tuesday 15 December, sold here instead of Cal.com (see stripe-checkout).
       Each class has one fixed time, so the rows are 'booked' straight away
       with session_on set - no booking link, nothing left to pick. She gets a
       confirmation; the teacher gets the same kind of note Cal.com bookings
       send (cal-instructor-notify); Erika is told when a class passes 18. */
    if (String(s?.metadata?.offer || "") === "bbb") {
      if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "no database credentials" }, 500);
      if (!RESEND_API_KEY) return json({ error: "no email service" }, 500);
      const field = (Array.isArray(s?.custom_fields) ? s.custom_fields : []).find((f: any) => f?.key === "attending");
      const online = String(field?.dropdown?.value || "") === "online";
      const bundle = String(s?.metadata?.bundle || "") || null;
      const result = await bbbBooked({ slugs, name, email, first, online, bundle, orderId, ref, adTags, share });
      if (!result.ok) return json({ error: "confirmation email failed", ledger: result.ledger }, 500);
      return json({ ok: true, bbb: true, ledger: result.ledger, classes: slugs });
    }

    /* EVERY ROW MUST CARRY THE SAME KEYS. PostgREST inserts an array as one
       statement and rejects the whole batch if one object has a field the
       others lack. The gift row used to be the only one with `notes`, so
       every gift purchase wrote nothing at all - money taken, emails sent,
       ledger empty. `row()` is the single place a row is shaped. */
    function row(fields: {
      student_name: string | null; student_email: string; class_slug: string;
      source: string; order_ref: string; amount_cents: number | null;
      notes: string | null;
    }) {
      return {
        student_name: fields.student_name,
        student_email: fields.student_email,
        class_slug: fields.class_slug,
        class_name: CLASS_NAMES[fields.class_slug] || fields.class_slug,
        source: fields.source,
        bundle_key: null,
        order_ref: fields.order_ref,
        amount_cents: fields.amount_cents,
        ref_code: ref,
        status: "owed",
        session_on: null,
        notes: fields.notes,
        ...adTags,
      };
    }

    /* One row per class, all 'owed' - unlike a Cal.com bundle, paying here
       books nothing, so there is no class with a date on it yet. */
    /* The sale marks its rows in notes, so the sales page and ledger can
       tell a Black Friday seat from a full-price one. One class on its own
       is a "single", as it would be on Cal.com. */
    const SALE_NOTE = isSale ? "Black Friday sale, 15% off (SHOPSMALL15)" : null;
    const rows = slugs.map((slug, i) => row({
      student_name: name || null,
      student_email: email,
      class_slug: slug,
      source: giftSlug ? "gift" : (isSale && slugs.length === 1) ? "single" : "multi-discount",
      order_ref: orderId,
      amount_cents: share(i),
      notes: SALE_NOTE,
    }));

    /* The gifted class belongs to the recipient, not the payer - it is her
       entitlement, and the QR check-in has to find it under her name on the
       day. When no recipient email was given the row goes to the buyer, who
       is passing the voucher on herself.

       Its order_ref carries a ":gift" suffix. The ledger allows one row per
       (order_ref, class_slug) so a retried webhook cannot double-grant - and
       without the suffix a gift of the SAME class as her own would collide
       with her row and sink the whole insert. The suffix keeps both rows
       distinct while a retry of the same session still collides, as it should. */
    if (giftSlug) {
      rows.push(row({
        student_name: giftName || null,
        student_email: giftEmail || email,
        class_slug: giftSlug,
        source: "gift",
        order_ref: `${orderId}:gift`,
        amount_cents: share(slugs.length),
        notes: (giftEmail
          ? `Gift from ${name || email}`
          : `Gift bought by ${name || email}, voucher to be handed over`)
          + (SALE_NOTE ? ` · ${SALE_NOTE}` : ""),
      }));
    }

    let ledger = "written";
    try {
      const res = await db("enrollments", { method: "POST", body: JSON.stringify(rows) });
      if (res.status === 409) {
        ledger = "already recorded";
      } else if (!res.ok) {
        ledger = "insert failed";
        console.error("enrollment insert failed", res.status, await res.text());
      }
    } catch (e) {
      ledger = "threw";
      console.error("ledger write threw", e);
    }

    /* She has paid and has no links. A 500 makes Stripe retry for up to three
       days, which is the only way she ever gets them without a human. */
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set - she has paid and has no links");
      return json({ error: "no email service", ledger }, 500);
    }

    function bookLine(slug: string) {
      return `<li style="margin:0 0 12px"><a href="${CAL}${esc(slug)}-redeem" ` +
        `style="color:#4F6B5C;font-weight:bold">${esc(CLASS_NAMES[slug] || slug)}</a></li>`;
    }
    function bookText(slug: string) {
      return `- ${CLASS_NAMES[slug] || slug}: ${CAL}${slug}-redeem`;
    }
    function wrap(inner: string) {
      return `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:520px">`
        + inner
        + `<p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co. · Dallas, Texas</p></div>`;
    }
    /* These links all go to Cal.com, and 21 October is not in Cal.com - it is
       booked on oct21.html. Without this line a buyer who wanted the big day
       has no way to find it. Drops out once sales for the day have closed. */
    const OCT21_HTML = salesClosed() ? "" : `<p style="margin:0 0 16px;padding:12px 14px;background:#EEF2EC;border-left:3px solid #4F6B5C">
      <strong>Want Wednesday, October 21?</strong> Those dates aren't in the links above.
      <a href="https://quintaand.co/oct21.html#already-paid" style="color:#4F6B5C;font-weight:bold">Book your class on October 21 here</a>
      with this email address — nothing more to pay.</p>`;
    const OCT21_TEXT = salesClosed() ? "" : `Want Wednesday, October 21? Those dates aren't in the links above. `
      + `Book your class on October 21 at https://quintaand.co/oct21.html#already-paid with this email address - nothing more to pay.\n\n`;
    const KEEP_HTML = OCT21_HTML + `<p style="margin:0 0 16px;font-size:14px;color:#5A5E55">Keep this
      email — the links stay good. If a class you want doesn't have a date yet,
      reply here and we'll tell you the moment it's on the calendar. Your classes
      are good until June 30, 2027 — and if we haven't given one a date by then, we
      refund it. <a href="https://quintaand.co/policies.html#classes-paid-for-in-advance" style="color:#5A5E55">How it works</a>.</p>`;
    const KEEP_TEXT = OCT21_TEXT + `Keep this email — the links stay good. If a class you want `
      + `doesn't have a date yet, reply here and we'll tell you the moment it's on `
      + `the calendar. Your classes are good until June 30, 2027, and if we haven't `
      + `given one a date by then, we refund it. How it works: `
      + `https://quintaand.co/policies.html#classes-paid-for-in-advance`;

    async function send(to: string, subject: string, html: string, text: string) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: SEND_FROM, to: [to],
          // copying Erika on a message already addressed to her sends it twice
          bcc: to === BCC ? undefined : [BCC],
          reply_to: BCC, subject, html, text,
        }),
      });
      if (!res.ok) console.error("Resend failed", to, res.status, await res.text());
      return res.ok;
    }

    /* A ledger write that failed for any reason other than "already there"
       is invisible otherwise: the buyer still gets her links, Erika is copied
       on the email, and nothing says the rows are missing until class day
       when the check-in matches nobody. So say it, to the one person who can
       put it right, in plain words. */
    if (ledger !== "written" && ledger !== "already recorded") {
      await send(BCC, `Ledger write failed — Stripe order ${orderId}`,
        wrap(`<p style="margin:0 0 12px">A Stripe purchase went through but its
          enrollment rows were not written (<code>${esc(ledger)}</code>).</p>
          <p style="margin:0 0 12px"><strong>Buyer:</strong> ${esc(name || "(no name)")},
          ${esc(email)}<br><strong>Classes:</strong> ${esc(slugs.join(", "))}${
            giftSlug ? `<br><strong>Gift:</strong> ${esc(giftSlug)} for ${esc(giftEmail || "the buyer to hand over")}` : ""}
          <br><strong>Order:</strong> ${esc(orderId)}</p>
          <p style="margin:0">She has been emailed her booking links as normal.
          Add the rows by hand, or ask Claude to — the function log has the detail.</p>`),
        `Ledger write failed (${ledger}) for Stripe order ${orderId}.\n`
          + `Buyer: ${name || "(no name)"}, ${email}\nClasses: ${slugs.join(", ")}\n`
          + (giftSlug ? `Gift: ${giftSlug} for ${giftEmail || "the buyer to hand over"}\n` : "")
          + `She has been emailed her links as normal. Add the rows by hand.\n`);
    }

    /* Two shapes of email. A gift to a named recipient sends her her own,
       and tells the buyer it has gone. Everything else is one email with a
       link per class. */
    const sentTo: string[] = [];
    const failed: string[] = [];

    if (giftSlug && giftEmail) {
      const who = giftName ? esc(giftName.split(/\s+/)[0]) : "there";
      const from = esc(name || "a friend");
      const ok1 = await send(giftEmail,
        `${name ? name.split(/\s+/)[0] + " has" : "Someone has"} given you a class`,
        wrap(`<p style="margin:0 0 16px">Hi ${who},</p>
          <p style="margin:0 0 16px"><strong>${from}</strong> has given you a place in
            <strong>${esc(CLASS_NAMES[giftSlug] || giftSlug)}</strong> at Quinta &amp; Co.
            It's paid for — all that's left is picking a date that suits you:</p>
          <ul style="margin:0 0 20px;padding-left:20px">${bookLine(giftSlug)}</ul>
          ${KEEP_HTML}`),
        `Hi ${who},\n\n${name || "A friend"} has given you a place in `
          + `${CLASS_NAMES[giftSlug] || giftSlug} at Quinta & Co. It's paid for — `
          + `all that's left is picking a date:\n\n${bookText(giftSlug)}\n\n${KEEP_TEXT}\n`);
      (ok1 ? sentTo : failed).push(giftEmail);
    }

    /* The buyer's own list. When she kept the voucher to hand over herself,
       the gifted class is on it too - named, so she knows which to pass on.

       If the gift is the SAME class as her own, both seats are booked through
       one and the same link, so listing it twice and saying "pass on the
       second one" pointed at two identical links. List it once and say what
       is actually true: she books hers, then sends her friend the same link. */
    const keptGift = !!giftSlug && !giftEmail;
    const sameClass = keptGift && slugs.includes(giftSlug);
    const mine = keptGift && !sameClass ? slugs.concat([giftSlug]) : slugs;
    const giftLabel = esc(CLASS_NAMES[giftSlug] || giftSlug);
    const giftNote = !keptGift ? "" : sameClass
      ? `<p style="margin:0 0 16px">You're both on the same class, so there's one link
         for the two of you. Book your place, then send her the same link and she
         books hers — there are two seats paid for.</p>`
      : `<p style="margin:0 0 16px"><strong>${giftLabel}</strong> is the gift — pass
         that link on to whoever you're giving it to, and she picks her own date.</p>`;
    const giftNoteText = !keptGift ? "" : sameClass
      ? `\nYou're both on the same class, so there's one link for the two of you. `
        + `Book your place, then send her the same link — two seats are paid for.\n`
      : `\n${CLASS_NAMES[giftSlug] || giftSlug} is the gift — pass that link on and `
        + `she picks her own date.\n`;
    const sentNote = giftSlug && giftEmail
      ? `<p style="margin:0 0 16px">We've emailed ${esc(giftName || giftEmail)} her own
         link for ${esc(CLASS_NAMES[giftSlug] || giftSlug)} — nothing for you to forward.</p>`
      : "";
    const sentNoteText = giftSlug && giftEmail
      ? `\nWe've emailed ${giftName || giftEmail} her own link for `
        + `${CLASS_NAMES[giftSlug] || giftSlug} — nothing for you to forward.\n`
      : "";

    /* A gift and nothing for herself (Black Friday sale). "Now pick your
       date" would be wrong - she isn't coming. Thank her, and either say it
       has gone to the recipient or give her the link to pass on. */
    if (!slugs.length) {
      const gName = esc(CLASS_NAMES[giftSlug] || giftSlug);
      const gText = CLASS_NAMES[giftSlug] || giftSlug;
      const okG = await send(email, "Your gift is paid for",
        wrap(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
          <p style="margin:0 0 16px">Thank you — genuinely. <strong>${gName}</strong> is paid for.</p>
          ${giftEmail
            ? `<p style="margin:0 0 16px">We've emailed ${esc(giftName || giftEmail)} her own link, and she
                 picks her own date. Nothing for you to forward.</p>`
            : `<p style="margin:0 0 16px">Here's the link to pass on. Whoever you give it to picks her own
                 date, and there's nothing more to pay:</p>
               <ul style="margin:0 0 20px;padding-left:20px">${bookLine(giftSlug)}</ul>`}
          ${KEEP_HTML}`),
        `Hi ${first},\n\nThank you — genuinely. ${gText} is paid for.\n\n`
          + (giftEmail
            ? `We've emailed ${giftName || giftEmail} her own link, and she picks her own date. Nothing for you to forward.\n`
            : `Here's the link to pass on. Whoever you give it to picks her own date, nothing more to pay:\n\n${bookText(giftSlug)}\n`)
          + `\n${KEEP_TEXT}\n`);
      (okG ? sentTo : failed).push(email);
      if (failed.length) {
        console.error(`Email failed for ${failed.join(", ")} on order ${orderId} - asking Stripe to retry`);
        return json({ error: "email failed", failed, ledger }, 500);
      }
      return json({ ok: true, ledger, emailed: sentTo.length, rows: rows.length,
        gift: giftEmail ? "sent to recipient" : "voucher to buyer" });
    }

    const many = mine.length > 1;
    const ok2 = await send(email,
      giftSlug ? "Your class, and the one you gave" : "Your classes — now pick your dates",
      wrap(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
        <p style="margin:0 0 16px">Thank you — genuinely. ${many ? "Those are" : "That's"}
          paid for. Now pick your ${many ? "dates" : "date"}. Each link books one class
          and there's nothing more to pay:</p>
        <ul style="margin:0 0 20px;padding-left:20px">${mine.map(bookLine).join("")}</ul>
        ${giftNote}${sentNote}${KEEP_HTML}`),
      `Hi ${first},\n\nThank you — genuinely. Now pick your ${many ? "dates" : "date"}. `
        + `Each link books one class, nothing more to pay:\n\n`
        + `${mine.map(bookText).join("\n")}\n${giftNoteText}${sentNoteText}\n${KEEP_TEXT}\n`);
    (ok2 ? sentTo : failed).push(email);

    /* Any email that did not go out means someone has paid and has no links.
       Answer 500 so Stripe retries - the ledger write is safe to repeat (a
       retry lands on the unique index and is recorded as already there), and
       a duplicate email is a far smaller problem than none. */
    if (failed.length) {
      console.error(`Email failed for ${failed.join(", ")} on order ${orderId} - asking Stripe to retry`);
      return json({ error: "email failed", failed, ledger }, 500);
    }

    return json({
      ok: true, ledger, emailed: sentTo.length, rows: rows.length,
      gift: giftSlug ? (giftEmail ? "sent to recipient" : "voucher to buyer") : null,
    });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
