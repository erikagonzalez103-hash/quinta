// Edge Function: oct21-redeem
//
// "I already paid for this class - put me on October 21."
//
// WHY THIS EXISTS
// Bundle, gift and choose-your-own buyers book their classes later with $0
// Cal.com links. 21 October is not in Cal.com any more - one Cal.com account
// goes "busy" across all its events once any is booked, so side-by-side
// classes would hide each other - so those links cannot reach the day. This
// is their way in: the oct21.html page sends her email and the session she
// wants, and if she is owed that class, her seat is booked.
//
// WHO CAN USE IT
// Anyone who knows the email a class was bought under. That is deliberately
// light - there is no login - and it is safe enough because the only thing it
// can do is move a class she already owns onto a date, and the confirmation
// goes to the OWNER's address with Erika copied. If someone books a class
// that is not theirs, the owner is told at once.
//
// SHORT-LIVED BY DESIGN. Delete with the Bookwhen migration after 21 October.
//
// Deploy with --no-verify-jwt - the public page calls it with no session.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { OCT21, SEATS, sessions, confirmStudent, tellTeacher, attendingFor, salesClosed } from "../_shared/oct21.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const SITE = "https://quintaand.co";
const ORIGINS = [SITE, "http://localhost:8137"];

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : SITE,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
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
  const head = cors(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...head } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: head });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_API_KEY) return json({ error: "not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase().slice(0, 200);
    const sessionId = String(body?.session || "");
    const chosen = body?.attending === "online" ? "online" : "in-person";
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
    if (salesClosed()) return json({ error: "closed" }, 409);

    const day = await sessions(SUPABASE_URL, SERVICE_KEY);
    const s = day.find((x) => x.session_id === sessionId);
    if (!s) return json({ error: "unknown_session" }, 400);
    if (s.seats_left <= 0) return json({ error: "full" }, 409);
    // An online-only session is online whatever she picked.
    const attending = attendingFor(s.format, chosen);

    /* Is she owed this class? Compared in code, not with a database pattern,
       because an underscore in an email address is a wildcard to LIKE. The
       oldest owed row goes first, so a bundle is used before a later gift. */
    const r = await db(
      `enrollments?class_slug=eq.${encodeURIComponent(s.class_slug)}&status=eq.owed` +
      `&select=id,student_email,student_name,created_at&order=created_at.asc`);
    if (!r.ok) {
      const detail = await r.text();
      console.error("owed lookup failed", r.status, detail);
      return json({ error: "lookup_failed" }, 502);
    }
    const owed = (await r.json() as Array<{ id: string; student_email: string; student_name: string | null }>)
      .find((x) => String(x.student_email || "").trim().toLowerCase() === email);
    if (!owed) return json({ error: "nothing_owed", class_name: s.class_name }, 404);

    /* Claim it - and only if it is STILL owed, so two taps on the button
       cannot spend the same class twice. */
    const claim = await db(`enrollments?id=eq.${owed.id}&status=eq.owed`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "booked", session_on: OCT21, session_id: s.session_id, attending }),
    });
    const claimed = claim.ok ? await claim.json() : [];
    if (!claimed.length) return json({ error: "already_used" }, 409);

    /* The seat check after booking, as stripe-webhook does: two women can
       claim the last seat at the same moment. Both keep it - Erika is fine
       with an extra chair - but she needs to know to put one out. */
    const cnt = await db(
      `enrollments?session_id=eq.${encodeURIComponent(s.session_id)}&status=in.(booked,taken)&select=id`,
      { headers: { Prefer: "count=exact" } });
    const total = Number((cnt.headers.get("content-range") || "").split("/")[1] || 0);
    if (total > SEATS) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Quinta & Co. <hello@quintaand.co>", to: ["erika@quintaand.co"],
          subject: `October 21 oversold — ${s.class_name} at ${String(s.start_time).slice(0, 5)} (${total} of ${SEATS})`,
          text: `${owed.student_name || "(no name)"} <${owed.student_email}> used a class she'd already paid for and took a seat in ${s.class_name}, which now has ${total} of ${SEATS}.\n`
            + `She has been confirmed as normal - you said an extra chair is fine. Just make sure the room has one.\n`,
        }),
      }).catch((e) => console.error("alert to Erika failed", e));
    }

    const seat = { session_id: s.session_id, class_name: s.class_name, start_time: String(s.start_time),
                   online: attending === "online" };
    const student = { name: owed.student_name || "", email: owed.student_email };
    const ok = await confirmStudent(RESEND_API_KEY, owed.student_email, student.name, [seat], attending);
    await tellTeacher(RESEND_API_KEY, SUPABASE_URL, SERVICE_KEY, seat, student, attending, false);

    return json({ ok: true, class_name: s.class_name, emailed: ok });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
