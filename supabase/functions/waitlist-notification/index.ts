// Edge Function: waitlist-notification
//
// ============================================================================
// SUPERSEDED - DO NOT DEPLOY, AND DO NOT ADD A DATABASE WEBHOOK FOR IT.
// Waitlist alerts and confirmations are sent by the GitHub Actions job
// .github/workflows/waitlist-alerts.yml (tools/waitlist-alerts.mjs), every 15
// minutes, which stamps notified_at so each signup is emailed once. That job
// replaced this function in August because the webhook here never fired.
//
// This was deployed again by mistake on 30 Sep 2026 and deleted on 1 Oct.
// Running both would send every signup two confirmations and Erika two
// alerts. Kept only as a record; safe to delete from the repo.
// ============================================================================
//
// Fires when someone joins the waitlist (insert into public.waitlist) and does
// two things:
//   1. tells Erika, with the referral code so credit is visible immediately
//   2. tells the person they're actually on the list
//
// WHY (2) EXISTS
// Until now the only confirmation was a green message on the page. Someone who
// signs up at 11pm has no evidence it worked, and the people who care most are
// the ones who then email asking. One short note prevents that.
//
// NOT A NEWSLETTER. The waitlist page promises "one email, the moment your
// class opens". This confirmation says so explicitly rather than quietly
// becoming a second marketing channel.
//
// SECRETS: RESEND_API_KEY (already set for signup-notification).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//
// WHY IT CHECKS THE TABLE BEFORE SENDING ANYTHING
// This function is public: a database webhook calls it with no signature. As
// first written it trusted whatever it was handed - so anyone who found the
// URL could post a made-up "signup" with any address in it and have
// hello@quintaand.co email that address, as many times as they liked. That
// is an open relay on the domain every Quinta email is sent from, and a
// quick way to get the domain marked as spam and the Resend account shut.
//
// So nothing is sent unless the row it describes really exists in
// public.waitlist, with the same email, created within the last hour. A
// forged payload fails the lookup. A real one replayed later fails the
// window. And each confirmation carries a Resend idempotency key built from
// the row id, so the same real row cannot be sent twice even inside it.
//
// It was finished on 11 September and never deployed; this guard went in
// on 30 September, before it was.
//
// Deploy with --no-verify-jwt - the database webhook sends no Supabase JWT,
// and the table lookup below is what authenticates the call.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const FRESH_MS = 60 * 60 * 1000;   // a real signup reaches us in seconds

/* Is this a real signup, made just now? Returns the row as the database has
   it - never the payload's copy, which is what an attacker controls. */
async function realRow(r: { id?: string; email?: string }): Promise<WaitlistRecord | null> {
  if (!SUPABASE_URL || !SERVICE_KEY || !r?.id || !r?.email) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?id=eq.${encodeURIComponent(String(r.id))}&select=*&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) {
    console.error("waitlist lookup failed", res.status, await res.text());
    return null;
  }
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  if (String(row.email || "").toLowerCase() !== String(r.email).toLowerCase()) return null;
  const age = Date.now() - new Date(row.created_at).getTime();
  if (!Number.isFinite(age) || age < -60000 || age > FRESH_MS) return null;
  return row as WaitlistRecord;
}

// The Zoho mailbox, not the old eridionglass.com address that
// signup-notification still points at.
const NOTIFY_TO = "erika@quintaand.co";
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const REPLY_TO = "hello@quintaand.co";

interface WaitlistRecord {
  id: string;
  created_at: string;
  name: string | null;
  email: string;
  class_slug: string | null;
  class_name: string | null;
  source: string | null;
  ref: string | null;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: WaitlistRecord;
  old_record: null | WaitlistRecord;
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>");
}

function orDash(s: string | null | undefined): string {
  return s && s.trim() ? escapeHtml(s) : "<em style='color:#888;'>not provided</em>";
}

function whenInDallas(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  });
}

/* ---------- 1. the alert to Erika ---------- */

function alertHtml(r: WaitlistRecord): string {
  const wanted = r.class_name || "All classes";
  const credit = r.ref
    ? `<div style="background:#F5F2EA;border-left:2px solid #6E8B7A;padding:14px 18px;margin-top:22px;font-size:14px;">
         <strong style="color:#20231F;">Referred by ${escapeHtml(r.ref)}</strong>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>New waitlist signup</title></head>
<body style="font-family: Georgia, 'Times New Roman', serif; background:#FAFAF6; color:#2F332E; margin:0; padding:24px;">
  <div style="max-width:620px;margin:0 auto;background:#FFFFFF;border:1px solid #DCD7CB;border-radius:4px;padding:40px 36px;">
    <div style="font-family:'Cinzel',Georgia,serif;font-size:11px;letter-spacing:.32em;color:#4F6B5C;text-transform:uppercase;margin-bottom:20px;">A New Waitlist Signup</div>
    <h1 style="font-family:'Cinzel',Georgia,serif;font-size:28px;color:#20231F;margin:0 0 8px 0;letter-spacing:.04em;">${escapeHtml(r.name || r.email)}</h1>
    <p style="color:#5A5E55;font-style:italic;font-size:14px;margin:0 0 28px 0;">joined ${whenInDallas(r.created_at)}</p>

    <div style="background:#F5F2EA;border-left:2px solid #6E8B7A;padding:18px 22px;font-size:14px;">
      <div style="margin-bottom:6px;"><strong style="color:#20231F;">Wants:</strong> ${escapeHtml(wanted)}</div>
      <div style="margin-bottom:6px;"><strong style="color:#20231F;">Email:</strong> ${escapeHtml(r.email)}</div>
      <div><strong style="color:#20231F;">Came from:</strong> ${orDash(r.source)}</div>
    </div>
    ${credit}

    <div style="border-top:1px solid #E8E3D7;margin-top:28px;padding-top:22px;text-align:center;font-size:13px;color:#8A8E83;font-style:italic;">
      She's been told she's on the list, and that the next email comes when ${escapeHtml(wanted)} opens.
    </div>
  </div>
</body>
</html>`;
}

function alertText(r: WaitlistRecord): string {
  return `New waitlist signup — ${r.name || r.email}

Wants: ${r.class_name || "All classes"}
Email: ${r.email}
Came from: ${r.source || "not provided"}
Referred by: ${r.ref || "no code"}
Joined: ${whenInDallas(r.created_at)}`;
}

/* ---------- 2. the confirmation to her ---------- */

function confirmHtml(r: WaitlistRecord): string {
  const wanted = r.class_name || "our classes";
  const hello = r.name ? `${escapeHtml(r.name.split(/\s+/)[0])},` : "Hello,";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>You're on the list</title></head>
<body style="font-family: Georgia, 'Times New Roman', serif; background:#FAFAF6; color:#2F332E; margin:0; padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCD7CB;border-radius:4px;padding:40px 36px;">
    <div style="font-family:'Cinzel',Georgia,serif;font-size:11px;letter-spacing:.32em;color:#4F6B5C;text-transform:uppercase;margin-bottom:20px;">Quinta &amp; Co.</div>

    <h1 style="font-family:'Cinzel',Georgia,serif;font-size:26px;color:#20231F;margin:0 0 20px 0;letter-spacing:.04em;">You're on the list</h1>

    <p style="margin:0 0 16px 0;line-height:1.65;">${hello}</p>
    <p style="margin:0 0 16px 0;line-height:1.65;">You're on the list for <strong>${escapeHtml(wanted)}</strong>. When dates open, you'll hear from us before it's announced anywhere else.</p>
    <p style="margin:0 0 28px 0;line-height:1.65;">That's the only email you'll get from this. The waitlist isn't a newsletter, and your address is never shared or sold.</p>

    <div style="border-top:1px solid #E8E3D7;padding-top:22px;font-size:13px;color:#8A8E83;line-height:1.6;">
      Practical business &amp; AI education · Dallas, Texas &amp; online<br>
      Questions? Just reply — this address is read by a person.
    </div>
  </div>
</body>
</html>`;
}

function confirmText(r: WaitlistRecord): string {
  const wanted = r.class_name || "our classes";
  return `${r.name ? r.name.split(/\s+/)[0] + "," : "Hello,"}

You're on the list for ${wanted}. When dates open, you'll hear from us before
it's announced anywhere else.

That's the only email you'll get from this. The waitlist isn't a newsletter,
and your address is never shared or sold.

—
Quinta & Co. · Practical business & AI education · Dallas, Texas & online
Questions? Just reply — this address is read by a person.`;
}

/* ---------- send ---------- */

async function sendEmail(msg: Record<string, unknown>, onceKey: string): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Resend sends each key at most once in 24 hours, so a replayed real
      // signup cannot fan out into repeat emails to the same person.
      "Idempotency-Key": onceKey,
    },
    body: JSON.stringify(msg),
  });
  if (!res.ok) return `${res.status} ${await res.text()}`;
  return null;
}

serve(async (req) => {
  try {
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const payload: WebhookPayload = await req.json();

    /* Returning 200 for the wrong table is how signup-notification looked
       healthy while doing nothing. Say plainly what was ignored. */
    if (payload.type !== "INSERT" || payload.table !== "waitlist") {
      console.warn(`ignored: ${payload.type} on ${payload.table}`);
      return new Response(
        JSON.stringify({ skipped: `expected INSERT on waitlist, got ${payload.type} on ${payload.table}` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    /* Everything below uses the DATABASE's copy of the row. If it is not a
       real signup from the last hour, nobody is emailed - and the answer is a
       plain 200 so a probing caller learns nothing about why. */
    const r = await realRow(payload.record || {});
    if (!r) {
      console.warn(`refused: no fresh waitlist row matches id ${payload.record?.id}`);
      return new Response(JSON.stringify({ skipped: "not a current signup" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    const wanted = r.class_name || "All classes";

    const alertErr = await sendEmail({
      from: SEND_FROM,
      to: [NOTIFY_TO],
      reply_to: r.email,               // reply goes straight to her
      subject: `Waitlist — ${r.name || r.email} wants ${wanted}`,
      html: alertHtml(r),
      text: alertText(r),
    }, `waitlist-alert-${r.id}`);

    /* Her confirmation matters more than Erika's alert: Erika can read the
       table, the visitor can't. Send it even if the alert failed. */
    const confirmErr = await sendEmail({
      from: SEND_FROM,
      to: [r.email],
      reply_to: REPLY_TO,
      subject: `You're on the list for ${wanted}`,
      html: confirmHtml(r),
      text: confirmText(r),
    }, `waitlist-confirm-${r.id}`);

    if (alertErr) console.error("alert to Erika failed:", alertErr);
    if (confirmErr) console.error("confirmation to signer failed:", confirmErr);

    return new Response(
      JSON.stringify({ ok: !alertErr && !confirmErr, alertErr, confirmErr }),
      { status: alertErr && confirmErr ? 500 : 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
