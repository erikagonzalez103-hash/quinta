// Edge Function: cal-instructor-notify
//
// Cal.com webhook -> the instructor's inbox.
//
// WHY THIS EXISTS
// Every Cal.com event type is owned by one account, Quinta & Co. The faculty
// are not users, hosts or team members there, so Cal.com's own booking email
// can only ever reach Erika. An instructor could have someone booked into her
// class and never hear about it — which is how a teacher turns up to an empty
// room, or fails to turn up to a full one.
//
// This is deliberately a second webhook rather than a change to cal-booking.
// That one feeds the Meta Conversions API and its job is attribution; mixing
// a teaching notification into it would mean an email failure could cost an ad
// conversion, and vice versa. They fail independently on purpose.
//
// SHORT-LIVED BY DESIGN. Class booking moves to Bookwhen after 21 October,
// where instructors have their own logins and are notified natively. This
// covers the classes running before then. Delete it with the migration.
//
// SECRETS: CAL_WEBHOOK_SECRET (same one cal-booking verifies against),
//          RESEND_API_KEY (already set for signup-notification).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//
// Deploy with --no-verify-jwt. Cal.com cannot send a Supabase JWT; the
// signature check below is what authenticates the caller.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CAL_WEBHOOK_SECRET = Deno.env.get("CAL_WEBHOOK_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const FALLBACK_TO = "erika@quintaand.co";   // used when no instructor is found

/* A booking can arrive on a twin: the bundle event, a redeem link, an old
   sale event. They are all doors into the same class, and the instructor
   cares about the class.

   A bundle twin is NOT named after a class — it is a duplicate of whichever
   class the buyer starts with, so it has to be mapped explicitly. Getting
   this wrong sends the email to nobody, because there is no class called
   "the-practice". Keep it in step with the BUNDLES block in
   fork-femme-foundations.html and with bundle/index.html.

   A bundle's anchor is whichever class it was pointed at in Cal.com, which
   is not always its headline class - two of these were re-anchored onto a
   class that actually had dates. Read the anchor off the event type's
   schedule in Cal.com, never off the bundle's name. */
const BUNDLE_STARTS_WITH: Record<string, string> = {
  "the-practice-fff": "module-1",
  "build-to-last-fff": "legacy-planning",   // re-anchored; Certification had no dates
  "keep-the-books-fff": "bookkeeping-2",    // re-anchored; Bookkeeping I has no dates
  "get-started-fff": "module-1",            // Entity setup has no instructor
};

function realSlug(slug: string): string {
  const s = String(slug || "");
  if (BUNDLE_STARTS_WITH[s]) return BUNDLE_STARTS_WITH[s];
  // a plain discount or redeem twin is the class with a suffix
  return s.replace(/-(redeem|fall25|herhouse(-duo)?)$/i, "");
}

/* Cal.com signs the raw body with HMAC-SHA256 and sends it as
   x-cal-signature-256. Compare in constant time. */
async function signatureOk(raw: string, header: string | null): Promise<boolean> {
  if (!CAL_WEBHOOK_SECRET) return false;
  if (!header) return false;
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

/* Dallas time, spelled out. Cal.com sends UTC. */
function dallas(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", weekday: "long", month: "long",
      day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

/* Who teaches this class? class_sessions is the faculty portal's own record,
   so it knows the instructor for a given class on a given date. Fall back to
   any session of that class, then to Erika — never drop the notification. */
async function findInstructor(slug: string, startIso: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  const day = String(startIso).slice(0, 10);
  const head = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
  const base = `${SUPABASE_URL}/rest/v1/class_sessions`
    + `?select=instructor_email,instructor_name,class_name,session_date`
    + `&class_slug=eq.${encodeURIComponent(slug)}`;

  for (const q of [`${base}&session_date=eq.${day}&limit=1`, `${base}&limit=1`]) {
    try {
      const res = await fetch(q, { headers: head });
      if (!res.ok) continue;
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length && rows[0].instructor_email) return rows[0];
    } catch (e) { console.error("lookup failed", e); }
  }
  return null;
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
    const trigger = body?.triggerEvent || body?.type || "";
    const p = body?.payload ?? body;

    if (!/BOOKING_(CREATED|RESCHEDULED|CANCELLED)/i.test(String(trigger))) {
      console.warn(`ignored trigger ${trigger}`);
      return json({ skipped: `not a booking event: ${trigger}` });
    }
    const cancelled = /CANCELLED/i.test(String(trigger));

    const bookedSlug = p?.eventType?.slug || p?.type || "";
    const slug = realSlug(bookedSlug);
    const start = p?.startTime || p?.start || "";
    const who = (p?.attendees && p.attendees[0]) || {};
    const student = who?.name || who?.email || "Someone";
    const studentEmail = who?.email || "";

    const found = await findInstructor(slug, start);
    const to = found?.instructor_email || FALLBACK_TO;
    const teacher = (found?.instructor_name || "").split(" ")[0] || "there";
    const className = found?.class_name || p?.eventType?.title || p?.title || slug;

    const verb = cancelled ? "cancelled her place in" : "booked";

    /* Say the twin out loud when it isn't the plain class. An instructor
       seeing a $0 booking should know it was a bundle being redeemed and
       not a pricing mistake. */
    const viaNote = bookedSlug && bookedSlug !== slug
      ? `<p style="margin:0 0 14px;color:#5A5E55;font-size:14px">She came through <strong>${esc(bookedSlug)}</strong> — a bundle or included class, so she has already paid.</p>`
      : "";

    /* How she is joining. Every class is one Cal.com event with one seat
       limit - ten seats in total, in the room and online together - and Cal.com
       will not put two locations on an event with seats. So the booking form
       asks "How are you joining?" instead, and the teacher is the one who
       sends an online student her video link.

       That only works if the answer is impossible to miss, so an online
       booking says so first, in its own line, and this email's reply-to is
       already the student - replying IS sending her the link.

       responses.attending is either the string or { value } depending on the
       field type; take either. Older bookings made before the question existed
       have no answer, and say nothing rather than guess. */
    const rawAttend = p?.responses?.attending?.value ?? p?.responses?.attending ?? "";
    const attending = typeof rawAttend === "string" ? rawAttend : "";
    const online = /online/i.test(attending);
    const joinHtml = cancelled || !attending ? "" : online
      ? `<p style="margin:0 0 16px;padding:12px 14px;background:#EEF2EC;border-left:3px solid #4F6B5C">
           <strong>She's joining online.</strong> Reply to this email with your video link — the
           reply goes straight to her. Before class is fine; the day before is kinder.</p>`
      : `<p style="margin:0 0 16px"><strong>Joining:</strong> in person at kiln</p>`;
    const joinText = cancelled || !attending ? "" : online
      ? `SHE'S JOINING ONLINE - reply to this email with your video link; the reply goes straight to her.\n\n`
      : `Joining: in person at kiln\n`;

    /* "online" in the subject so the teacher sees it in her inbox list,
       without opening the email. */
    const subject = cancelled
      ? `Cancellation — ${className}, ${dallas(start)}`
      : `New booking${online ? " (online)" : ""} — ${className}, ${dallas(start)}`;

    const html = `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:520px">
      <p style="margin:0 0 16px">Hi ${esc(teacher)},</p>
      <p style="margin:0 0 16px"><strong>${esc(student)}</strong> just ${verb} <strong>${esc(className)}</strong>.</p>
      ${joinHtml}
      <p style="margin:0 0 6px"><strong>When:</strong> ${esc(dallas(start))} (Dallas time)</p>
      ${studentEmail ? `<p style="margin:0 0 16px"><strong>Her email:</strong> ${esc(studentEmail)}</p>` : ""}
      ${viaNote}
      ${cancelled || online ? "" : `<p style="margin:0 0 16px">Nothing to do — this is just so you know. Your sign-in code for the day is in
        <a href="https://quintaand.co/faculty/sign-in.html" style="color:#4F6B5C">your portal</a>.</p>`}
      <p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co.</p>
    </div>`;

    const text = `Hi ${teacher},\n\n${student} just ${verb} ${className}.\n\n`
      + joinText
      + `When: ${dallas(start)} (Dallas time)\n`
      + (studentEmail ? `Her email: ${studentEmail}\n` : "")
      + (bookedSlug !== slug ? `Came through ${bookedSlug} — already paid.\n` : "")
      + (cancelled || online ? "" : `\nNothing to do. Your sign-in code is at quintaand.co/faculty/sign-in.html\n`);

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SEND_FROM,
        to: [to],
        cc: to === FALLBACK_TO ? undefined : [FALLBACK_TO],  // Erika sees it too
        reply_to: studentEmail || FALLBACK_TO,
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

    /* Log loudly when nobody was found, because a silent fallback to Erika
       looks identical to working properly. */
    if (!found) {
      console.warn(`No instructor for "${slug}" (booked as "${bookedSlug}") — sent to ${FALLBACK_TO} instead.`);
    }

    return json({ ok: true, slug, sent_to: to, matched_instructor: !!found });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
