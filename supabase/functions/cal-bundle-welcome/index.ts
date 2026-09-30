// Edge Function: cal-bundle-welcome
//
// Cal.com webhook -> the enrollments ledger, and the buyer's inbox.
//
// IT DOES TWO JOBS, and the name only says one. It writes an enrollment row
// for EVERY booking, and additionally emails the buyer when that booking was
// a bundle. The name is kept because renaming an Edge Function means taking
// the webhook down in Cal.com and rebuilding it with the secret, and a
// misleading name is cheaper than a window where sales record nothing.
//
// WHY THE LEDGER LIVES HERE
// Cal.com was the only record of who bought what. cal-booking speaks to Meta
// and writes nothing; cal-instructor-notify emails a teacher and writes
// nothing. So enrollments was filled by hand, with tools/enrollments-from-cal.py,
// which means the QR check-in on class day could not close anybody's
// entitlement unless someone had remembered to run an import first. This
// function already receives the buyer, her email, the bundle and the Cal.com
// booking id at exactly the right moment, so it writes the rows itself.
//
// WHY THE LINK IS EMAILED
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
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
// enrollments has RLS on with no policies and anon/authenticated revoked, so
// the service role is the only way in — which is the point.
//
// Deploy with --no-verify-jwt — Cal.com cannot send a Supabase JWT, and the
// signature check below is what authenticates the caller.
//
// The Cal.com webhook must have BOTH "Booking created" and "Booking
// cancelled" ticked. Without the second one a cancelled class stays on the
// ledger as still owed, and the seat is never released.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CAL_WEBHOOK_SECRET = Deno.env.get("CAL_WEBHOOK_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const BCC = "erika@quintaand.co";          // so a silent failure is visible
const PAGE = "https://quintaand.co/bundle/?b=";

/* The four bundles, by the slug Cal.com actually books.

   `anchor` is the class that buying the bundle actually books — read off the
   event type's schedule in Cal.com, NOT off the bundle's name. Two of these
   were re-anchored onto a class that had dates when the headline one did not.

   `classes` is every class the bundle entitles her to, anchor included. The
   anchor's row is written as 'booked' with a date; the rest as 'owed'.

   This is the third place the bundle contents are written down, after
   bundle/index.html and fork-femme-foundations.html. Nothing keeps the three
   in step automatically, so change them together. */
const BUNDLES: Record<string, {
  key: string; name: string; anchor: string; classes: string[];
}> = {
  "get-started-fff": {
    key: "get-started", name: "Get started", anchor: "module-1",
    classes: ["module-1", "bookkeeping-1"],
  },
  "keep-the-books-fff": {
    key: "keep-the-books", name: "Keep the books", anchor: "bookkeeping-2",
    classes: ["bookkeeping-2", "bookkeeping-1"],
  },
  "build-to-last-fff": {
    key: "build-to-last", name: "Build to last", anchor: "legacy-planning",
    classes: ["legacy-planning", "certification", "financial-planning",
              "trademarks", "brand-101"],
  },
  "the-practice-fff": {
    key: "the-practice", name: "The Practice", anchor: "module-1",
    classes: ["module-1", "module-2", "module-3"],
  },
};

/* Readable names for the ledger, so a report does not read as slugs. Only the
   classes that appear inside a bundle need to be here; a single-class booking
   takes its name from the Cal.com event title. */
const CLASS_NAMES: Record<string, string> = {
  "module-1": "Module 1 — Claude for beginners",
  "module-2": "Module 2 — Build your AI assistant",
  "module-3": "Module 3 — Real databases & automation",
  "bookkeeping-1": "Bookkeeping I — Set up QuickBooks",
  "bookkeeping-2": "Bookkeeping II — Prep for your bookkeeper",
  "legacy-planning": "Legacy planning",
  "certification": "Get certified — WBE / MBE / DBE",
  "financial-planning": "Investing — How to pay yourself first",
  "trademarks": "Trademarks",
  "brand-101": "Brand 101",
};

/* A booking can land on a twin. Strip the suffix to get the real class. */
function realSlug(slug: string): string {
  return String(slug || "").replace(/-(redeem|fall25|herhouse(-duo)?)$/i, "");
}

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

/* ---------------------------------------------------------------- ledger -- */

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

type Buyer = {
  name: string; email: string; uid: string;
  start: string; day: string | null; ref: string | null;
};

/* Every booking writes to the ledger, but there are three shapes of it.

   1. A BUNDLE writes one row per class it contains. The anchor - the class
      this booking actually reserved - is 'booked' with its date. The others
      are 'owed' until she books them with a redeem link.
   2. A REDEEM twin is one of those owed rows coming due. It updates the row
      rather than inserting, or the ledger would double-count what she paid
      for once.
   3. A PLAIN CLASS writes a single 'booked' row.

   Idempotent by (order_ref, class_slug), which has a unique index, so a
   Cal.com retry lands on a 409 and is treated as already done. */
async function recordBooking(
  bookedSlug: string, buyer: Buyer, title: string, amountCents: number | null,
): Promise<Record<string, unknown>> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Supabase service credentials missing - nothing written");
    return { ledger: "skipped, no credentials" };
  }

  const bundle = BUNDLES[bookedSlug];
  const slug = realSlug(bookedSlug);
  const isRedeem = /-redeem$/i.test(bookedSlug);

  if (isRedeem) {
    /* Close the oldest matching owed row. Matching on email and class, not on
       order_ref, because the redeem booking is a different Cal.com order from
       the bundle that paid for it. */
    const q = `enrollments?student_email=eq.${encodeURIComponent(buyer.email)}`
      + `&class_slug=eq.${encodeURIComponent(slug)}&status=eq.owed`
      + `&order=created_at.asc&limit=1`;
    const res = await db(q, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "booked", session_on: buyer.day }),
    });
    const rows = res.ok ? await res.json() : [];
    if (!res.ok) console.error("redeem patch failed", res.status, await res.text());
    if (!rows.length) {
      /* She booked a redeem link with nothing owed against it. Record it so
         it is visible rather than silently free. */
      console.warn(`Redeem of ${slug} by ${buyer.email} matched no owed row.`);
      return { ledger: "redeem with no owed row", class_slug: slug };
    }
    return { ledger: "redeem closed", class_slug: slug };
  }

  const rows = bundle
    ? bundle.classes.map((cs) => ({
        student_name: buyer.name,
        student_email: buyer.email,
        class_slug: cs,
        class_name: CLASS_NAMES[cs] || cs,
        source: "bundle",
        bundle_key: bundle.key,
        order_ref: buyer.uid,
        amount_cents: cs === bundle.anchor ? amountCents : 0,
        ref_code: buyer.ref,
        status: cs === bundle.anchor ? "booked" : "owed",
        session_on: cs === bundle.anchor ? buyer.day : null,
      }))
    : [{
        student_name: buyer.name,
        student_email: buyer.email,
        class_slug: slug,
        class_name: CLASS_NAMES[slug] || title || slug,
        source: "single",
        bundle_key: null,
        order_ref: buyer.uid,
        amount_cents: amountCents,
        ref_code: buyer.ref,
        status: "booked",
        session_on: buyer.day,
      }];

  const res = await db("enrollments", { method: "POST", body: JSON.stringify(rows) });
  if (res.status === 409) {
    return { ledger: "already recorded", rows: rows.length };
  }
  if (!res.ok) {
    console.error("enrollment insert failed", res.status, await res.text());
    return { ledger: "insert failed", status: res.status };
  }
  return { ledger: bundle ? "bundle recorded" : "class recorded", rows: rows.length };
}

/* A cancellation.

   A Cal.com cancellation means "not on that date". It does NOT mean "refund
   me" - Cal.com cannot tell the two apart, and Erika refunds by hand. So:

   - A cancelled REDEEM: she still owns the class, she gave back the date.
     It returns to 'owed'.
   - A cancelled BUNDLE: same thing for its first class only. That row goes
     back to 'owed'; every other class in the bundle is untouched. This used
     to delete every row on the order that was not yet taken - including
     classes she had already booked through her redeem links - so cancelling
     one date quietly wiped out the rest of a $990 purchase.
   - A cancelled SINGLE class: that one row goes. It was one class, paid for
     on that booking, and it is gone with it.

   A class already taken is never touched; she attended it whatever the
   booking now says. */
async function undoBooking(bookedSlug: string, buyer: Buyer) {
  if (!SUPABASE_URL || !SERVICE_KEY) return { ledger: "skipped, no credentials" };
  const slug = realSlug(bookedSlug);

  const bundle = BUNDLES[bookedSlug];
  if (bundle) {
    const q = `enrollments?order_ref=eq.${encodeURIComponent(buyer.uid)}`
      + `&class_slug=eq.${encodeURIComponent(bundle.anchor)}&status=eq.booked`;
    const res = await db(q, {
      method: "PATCH",
      body: JSON.stringify({ status: "owed", session_on: null }),
    });
    return { ledger: res.ok ? "bundle date returned to owed" : "bundle undo failed" };
  }

  if (/-redeem$/i.test(bookedSlug)) {
    const q = `enrollments?student_email=eq.${encodeURIComponent(buyer.email)}`
      + `&class_slug=eq.${encodeURIComponent(slug)}&status=eq.booked`;
    const res = await db(q, {
      method: "PATCH",
      body: JSON.stringify({ status: "owed", session_on: null }),
    });
    return { ledger: res.ok ? "redeem returned to owed" : "redeem undo failed" };
  }

  const res = await db(
    `enrollments?order_ref=eq.${encodeURIComponent(buyer.uid)}&status=neq.taken`,
    { method: "DELETE" });
  return { ledger: res.ok ? "booking removed" : "removal failed" };
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

    const created = /BOOKING_CREATED/i.test(trigger);
    const cancelled = /BOOKING_CANCELLED/i.test(trigger);
    if (!created && !cancelled) {
      return json({ skipped: `not a booking event: ${trigger}` });
    }

    const bookedSlug = String(p?.eventType?.slug || p?.type || "");
    const bundle = BUNDLES[bookedSlug];

    const who = (p?.attendees && p.attendees[0]) || {};
    const to = String(who?.email || "");
    const start = String(p?.startTime || p?.start || "");
    const booked = p?.eventType?.title || p?.title || "your first class";

    /* A referral code, if the booking carried one. Each class event has a
       hidden "ref" booking field that Cal.com fills from ?ref= on the booking
       URL, and a booking field's answer arrives in `responses`, not in
       `metadata` - which is where this used to look, so it found nothing.
       responses.ref is either the string or { value } depending on the field
       type; take either, then fall back to the tracking params. */
    const rawRef = p?.responses?.ref?.value ?? p?.responses?.ref
      ?? p?.metadata?.ref ?? p?.tracking?.utm_source ?? "";
    const ref = String(typeof rawRef === "string" ? rawRef : "")
      .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || null;

    const buyer: Buyer = {
      name: String(who?.name || "").trim(),
      email: to,
      uid: String(p?.uid || p?.bookingUid || ""),
      start,
      day: start ? start.slice(0, 10) : null,
      ref,
    };

    /* The ledger first, and inside its own try. A write that fails must not
       stop the buyer being emailed - she has paid, and a missing row is a
       reconciliation job while a missing email is a lost customer. */
    let ledger: Record<string, unknown> = { ledger: "not attempted" };
    if (!to) {
      console.error(`${bookedSlug} booked with no attendee email — cannot record or send.`);
    } else {
      try {
        ledger = cancelled
          ? await undoBooking(bookedSlug, buyer)
          : await recordBooking(
              bookedSlug, buyer, String(booked),
              typeof p?.price === "number" ? Math.round(p.price * 100) : null);
      } catch (e) {
        console.error("ledger write threw", e);
        ledger = { ledger: "threw", detail: String(e) };
      }
    }

    /* Email only a new bundle sale. A reschedule keeps the same bundle and she
       already has the link; a cancellation should not be congratulated. */
    if (!created || !bundle) {
      return json({ ok: true, slug: bookedSlug, emailed: false, ...ledger });
    }
    if (!to) return json({ error: "no attendee email" }, 422);

    const first = String(who?.name || "").trim().split(/\s+/)[0] || "there";
    const link = PAGE + bundle.key;
    const count = bundle.classes.length - 1;

    const rest = count === 1
      ? "the one remaining class in your bundle"
      : `the other ${count} classes in your bundle`;

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

    return json({ ok: true, bundle: bundle.key, emailed: true, sent_to: to, ...ledger });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
