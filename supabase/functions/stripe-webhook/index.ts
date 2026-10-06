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
import { OCT21, SEATS, sessions as oct21Sessions, confirmStudent, tellTeacher, attendingFor, type Session } from "../_shared/oct21.ts";

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
  "module-1": "Module 1 — Claude for beginners",
  "module-2": "Module 2 — Build your AI assistant",
  "brand-101": "Brand 101",
  "financial-planning": "Investing — How to pay yourself first",
  "certification": "Get certified — WBE / MBE / DBE",
  "legacy-planning": "Legacy planning",
  "trademarks": "Trademarks",
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
    if (event?.type !== "checkout.session.completed") {
      return json({ skipped: `not a completed checkout: ${event?.type}` });
    }

    const s = event?.data?.object ?? {};
    const slugs = String(s?.metadata?.slugs || "")
      .split(",").map((x: string) => x.trim()).filter(Boolean);
    if (!slugs.length) {
      console.error(`Session ${s?.id} completed with no slugs in metadata - nothing to grant.`);
      return json({ error: "no slugs" }, 422);
    }

    /* A gift carries a second class for a second person. Her email is
       optional: the offer is written so the buyer may be handing the voucher
       over herself, and in that case both links go to the payer with the
       gifted one clearly marked. */
    const giftSlug = String(s?.metadata?.gift_slug || "").trim();
    const giftEmail = String(s?.metadata?.gift_email || "").trim();
    const giftName = String(s?.metadata?.gift_name || "").trim();

    const email = String(s?.customer_details?.email || "");
    const name = String(s?.customer_details?.name || "").trim();
    if (!email) {
      console.error(`Session ${s?.id} completed with no email - cannot record or send.`);
      return json({ error: "no email" }, 422);
    }
    const first = name.split(/\s+/)[0] || "there";
    const paid = typeof s?.amount_total === "number" ? s.amount_total : null;

    const ref = String(s?.metadata?.ref || "").trim() || null;
    const orderId = String(s?.id || "");

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
                + `She has paid and been confirmed. Decide: an extra chair, or a refund and an apology.\n` : "")
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
      };
    }

    /* One row per class, all 'owed' - unlike a Cal.com bundle, paying here
       books nothing, so there is no class with a date on it yet. */
    const rows = slugs.map((slug, i) => row({
      student_name: name || null,
      student_email: email,
      class_slug: slug,
      source: giftSlug ? "gift" : "multi-discount",
      order_ref: orderId,
      amount_cents: share(i),
      notes: null,
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
        notes: giftEmail
          ? `Gift from ${name || email}`
          : `Gift bought by ${name || email}, voucher to be handed over`,
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
    const KEEP_HTML = `<p style="margin:0 0 16px;font-size:14px;color:#5A5E55">Keep this
      email — the links stay good. If a class you want doesn't have a date yet,
      reply here and we'll tell you the moment it's on the calendar. Your classes
      are good until June 30, 2027 — and if we haven't given one a date by then, we
      refund it. <a href="https://quintaand.co/policies.html#classes-paid-for-in-advance" style="color:#5A5E55">How it works</a>.</p>`;
    const KEEP_TEXT = `Keep this email — the links stay good. If a class you want `
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
