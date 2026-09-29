// Edge Function: cal-bundle-welcome
//
// Cal.com webhook -> the buyer's inbox, with the link to the rest of her bundle.
//
// WHY THIS EXISTS
// Buying a bundle in Cal.com books exactly one class — whichever one the
// bundle event is anchored to. The other classes are $0 "redeem" twins, and
// they are hidden so the public booking page never lists them. Hidden means
// the buyer cannot find them either.
//
// The obvious fix is Cal.com's "redirect on booking", which would send her
// straight to quintaand.co/bundle/?b=... after checkout. That is a team-plan
// feature and this account is not on one; the API answers 403. So the link
// travels by email instead — which is better anyway, because an email
// survives her closing the tab.
//
// This is a separate function from cal-instructor-notify on purpose, the same
// way that one is separate from cal-booking. A failure to email the buyer
// must not stop the teacher being told someone is coming, and vice versa.
//
// SHORT-LIVED BY DESIGN. Class booking moves to Bookwhen after 21 October,
// which handles multi-class passes natively. Delete this with the migration.
//
// SECRETS: CAL_WEBHOOK_SECRET (the same one the other Cal.com functions
//          verify against), RESEND_API_KEY (already set).
//
// Deploy with --no-verify-jwt — Cal.com cannot send a Supabase JWT, and the
// signature check below is what authenticates the caller.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CAL_WEBHOOK_SECRET = Deno.env.get("CAL_WEBHOOK_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const BCC = "erika@quintaand.co";          // so a silent failure is visible
const PAGE = "https://quintaand.co/bundle/?b=";

/* The four bundles, by the slug Cal.com actually books.
   `key` is the ?b= value on the bundle page; `count` is how many classes are
   still to book after this one, used only to write a true sentence.

   The page itself owns the class list. Deliberately not repeated here — a
   third copy is a third thing to forget. Keep these keys in step with the
   BUNDLES block in bundle/index.html. */
const BUNDLES: Record<string, { key: string; name: string; count: number }> = {
  "get-started-fff": { key: "get-started", name: "Get started", count: 1 },
  "keep-the-books-fff": { key: "keep-the-books", name: "Keep the books", count: 1 },
  "build-to-last-fff": { key: "build-to-last", name: "Build to last", count: 4 },
  "the-practice-fff": { key: "the-practice", name: "The Practice", count: 2 },
};

async function signatureOk(raw: string, header: string | null): Promise<boolean> {
  if (!CAL_WEBHOOK_SECRET || !header) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(CAL_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const mine = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const theirs = header.trim().toLowerCase().replace(/^sha256=/, "");
  if (mine.length !== theirs.length) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ theirs.charCodeAt(i);
  return diff === 0;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function dallas(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", weekday: "long", month: "long",
      day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });

  try {
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return json({ error: "RESEND_API_KEY not configured" }, 500);
    }

    const raw = await req.text();
    if (!(await signatureOk(raw, req.headers.get("x-cal-signature-256")))) {
      console.error("Rejected: bad or missing x-cal-signature-256. Is the Secret set on this webhook in Cal.com?");
      return json({ error: "bad signature" }, 401);
    }

    const body = JSON.parse(raw);
    const trigger = String(body?.triggerEvent || body?.type || "");
    const p = body?.payload ?? body;

    /* Only a new booking. A reschedule keeps the same bundle and she already
       has the link; a cancellation should not be congratulated. */
    if (!/BOOKING_CREATED/i.test(trigger)) {
      return json({ skipped: `not a new booking: ${trigger}` });
    }

    const bookedSlug = String(p?.eventType?.slug || p?.type || "");
    const bundle = BUNDLES[bookedSlug];
    if (!bundle) {
      return json({ skipped: `not a bundle: ${bookedSlug}` });
    }

    const who = (p?.attendees && p.attendees[0]) || {};
    const to = who?.email || "";
    if (!to) {
      console.error(`Bundle ${bookedSlug} booked with no attendee email — nothing to send to.`);
      return json({ error: "no attendee email" }, 422);
    }
    const first = String(who?.name || "").trim().split(/\s+/)[0] || "there";
    const booked = p?.eventType?.title || p?.title || "your first class";
    const start = p?.startTime || p?.start || "";
    const link = PAGE + bundle.key;

    const rest = bundle.count === 1
      ? "the one remaining class in your bundle"
      : `the other ${bundle.count} classes in your bundle`;

    const subject = `Your ${bundle.name} bundle — booking the rest`;

    const html = `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:520px">
      <p style="margin:0 0 16px">Hi ${esc(first)},</p>
      <p style="margin:0 0 16px">You're booked into <strong>${esc(booked)}</strong>${
        start ? ` on ${esc(dallas(start))}` : ""
      }. Thank you — genuinely.</p>
      <p style="margin:0 0 16px">Your <strong>${esc(bundle.name)}</strong> bundle also covers
        ${esc(rest)}, and they're already paid for. Book them whenever suits you:</p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="display:inline-block;padding:13px 22px;border-radius:9px;background:#4F6B5C;color:#FAFAF6;text-decoration:none;font-family:Georgia,serif;font-size:15px">Book the rest of my bundle</a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#5A5E55">Keep this email — the same
        link brings you back any time. If a class you want doesn't have a date yet,
        that's us, not you: reply here and we'll tell you the moment it's on the
        calendar. Your seat keeps until you take it.</p>
      <p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co. · Dallas, Texas</p>
    </div>`;

    const text = `Hi ${first},\n\n`
      + `You're booked into ${booked}${start ? ` on ${dallas(start)}` : ""}. Thank you.\n\n`
      + `Your ${bundle.name} bundle also covers ${rest}, and they're already paid for. `
      + `Book them whenever suits you:\n\n${link}\n\n`
      + `Keep this email — the same link brings you back any time. If a class you want `
      + `doesn't have a date yet, reply here and we'll tell you the moment it's on the `
      + `calendar. Your seat keeps until you take it.\n\nQuinta & Co.\n`;

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SEND_FROM,
        to: [to],
        bcc: [BCC],
        reply_to: BCC,
        subject,
        html,
        text,
      }),
    });

    if (!send.ok) {
      const detail = await send.text();
      console.error("Resend failed", send.status, detail);
      return json({ error: "send failed", status: send.status, detail }, 500);
    }

    return json({ ok: true, bundle: bundle.key, sent_to: to });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
