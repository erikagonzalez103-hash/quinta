/**
 * Quinta & Co. — waitlist alerts
 *
 * WHAT IT DOES
 * Finds every waitlist signup nobody has been emailed about yet, tells Erika,
 * confirms to the woman who signed up, and stamps the row so the next run
 * leaves it alone.
 *
 * WHY IT EXISTS RATHER THAN THE EDGE FUNCTION
 * The edge function is fine code that never ran. Robin Frazier signed up twice
 * on 19 August, twelve days after it shipped, and no email was sent either
 * time — the only reason anyone knew was that Robin mentioned it. The missing
 * piece was in the Supabase dashboard, where nothing is visible from the repo
 * and nothing announces itself when it breaks.
 *
 * So this runs from the repo on a schedule. You can read it, run it by hand,
 * and see its history. When it fails, GitHub emails about the failed run —
 * which means even a broken notifier notifies.
 *
 * SECRETS (GitHub → Settings → Secrets and variables → Actions)
 *   SUPABASE_SERVICE_ROLE_KEY  reads the waitlist and stamps notified_at
 *   RESEND_API_KEY             the same key the edge function uses
 *
 * RUN BY HAND
 *   SUPABASE_SERVICE_ROLE_KEY=… RESEND_API_KEY=… node tools/waitlist-alerts.mjs
 *   Add --dry-run to see what it would send without sending anything.
 */

const SUPABASE_URL = "https://pmpaslevwimofohirves.supabase.co";
const NOTIFY_TO = "erika@quintaand.co";
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const REPLY_TO = "hello@quintaand.co";

/* A signup older than this was probably missed by a long outage rather than
   arriving just now. It still gets Erika an alert, but no cheerful "you're on
   the list" to the person — a confirmation for something she did three weeks
   ago reads as broken, not attentive. */
const CONFIRM_WITHIN_HOURS = 48;

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function whenInDallas(iso) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  });
}

export function alertHtml(r) {
  const wanted = r.class_name || "All classes";
  const credit = r.ref
    ? `<div style="background:#F5F2EA;border-left:2px solid #6E8B7A;padding:14px 18px;margin-top:22px;font-size:14px;"><strong style="color:#20231F;">Referred by ${esc(r.ref)}</strong></div>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>New waitlist signup</title></head>
<body style="font-family:Georgia,'Times New Roman',serif;background:#FAFAF6;color:#2F332E;margin:0;padding:24px;">
  <div style="max-width:620px;margin:0 auto;background:#FFFFFF;border:1px solid #DCD7CB;border-radius:4px;padding:40px 36px;">
    <div style="font-size:11px;letter-spacing:.32em;color:#4F6B5C;text-transform:uppercase;margin-bottom:20px;">A New Waitlist Signup</div>
    <h1 style="font-size:28px;color:#20231F;margin:0 0 8px 0;letter-spacing:.04em;">${esc(r.name || r.email)}</h1>
    <p style="color:#5A5E55;font-style:italic;font-size:14px;margin:0 0 28px 0;">joined ${esc(whenInDallas(r.created_at))}</p>
    <div style="background:#F5F2EA;border-left:2px solid #6E8B7A;padding:18px 22px;font-size:14px;">
      <div style="margin-bottom:6px;"><strong style="color:#20231F;">Wants:</strong> ${esc(wanted)}</div>
      <div style="margin-bottom:6px;"><strong style="color:#20231F;">Email:</strong> ${esc(r.email)}</div>
      <div><strong style="color:#20231F;">Came from:</strong> ${esc(r.source || "not provided")}</div>
    </div>${credit}
  </div></body></html>`;
}

export function alertText(r) {
  return `New waitlist signup — ${r.name || r.email}

Wants: ${r.class_name || "All classes"}
Email: ${r.email}
Came from: ${r.source || "not provided"}
Referred by: ${r.ref || "no code"}
Joined: ${whenInDallas(r.created_at)}`;
}

export function confirmHtml(r) {
  const wanted = r.class_name || "our classes";
  const hello = r.name ? `${esc(String(r.name).split(/\s+/)[0])},` : "Hello,";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>You're on the list</title></head>
<body style="font-family:Georgia,'Times New Roman',serif;background:#FAFAF6;color:#2F332E;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCD7CB;border-radius:4px;padding:40px 36px;">
    <div style="font-size:11px;letter-spacing:.32em;color:#4F6B5C;text-transform:uppercase;margin-bottom:20px;">Quinta &amp; Co.</div>
    <h1 style="font-size:26px;color:#20231F;margin:0 0 20px 0;letter-spacing:.04em;">You're on the list</h1>
    <p style="margin:0 0 16px 0;line-height:1.65;">${hello}</p>
    <p style="margin:0 0 16px 0;line-height:1.65;">You're on the list for <strong>${esc(wanted)}</strong>. When dates open, you'll hear from us before it's announced anywhere else.</p>
    <p style="margin:0 0 16px 0;line-height:1.65;">That's the only email you'll get from this. The waitlist isn't a newsletter, and your address is never shared or sold.</p>
    <p style="margin:0 0 28px 0;line-height:1.65;">In the meantime, <a href="https://quintaand.co/coffee.html" style="color:#4F6B5C;">Coffee with Quinta</a> is free and the best seat in the house.</p>
    <div style="border-top:1px solid #E8E3D7;padding-top:22px;font-size:13px;color:#8A8E83;line-height:1.6;">
      Practical business &amp; AI education · Dallas, Texas &amp; online<br>
      Questions? Just reply — this address is read by a person.
    </div>
  </div></body></html>`;
}

/* ---------------------------------------------------------------- the run -- */

export async function run({ fetch, env, log = console.log, now = () => new Date() }) {
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const resend = env.RESEND_API_KEY;
  const dryRun = !!env.DRY_RUN;

  const missing = ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"].filter((k) => !env[k]);
  if (missing.length && !dryRun) throw new Error(`Missing secret(s): ${missing.join(", ")}`);

  const db = (path, init = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: service, Authorization: `Bearer ${service}`,
                 "Content-Type": "application/json", ...(init.headers || {}) },
    });

  const res = await db("waitlist?notified_at=is.null&select=id,created_at,name,email,class_slug,class_name,source,ref&order=created_at.asc");
  if (!res.ok) throw new Error(`Reading the waitlist failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();

  if (!rows.length) { log("No new signups."); return { sent: 0, rows: [] }; }
  log(`${rows.length} signup(s) nobody has been told about.`);

  const send = async (msg) => {
    if (dryRun) { log(`  [dry run] would email ${msg.to.join(", ")} — "${msg.subject}"`); return null; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    return r.ok ? null : `${r.status} ${await r.text()}`;
  };

  const failures = [];
  let sent = 0;

  for (const r of rows) {
    const wanted = r.class_name || "All classes";

    const alertErr = await send({
      from: SEND_FROM, to: [NOTIFY_TO], reply_to: r.email,
      subject: `Waitlist — ${r.name || r.email} wants ${wanted}`,
      html: alertHtml(r), text: alertText(r),
    });

    /* Erika's alert is the one that decides whether this row counts as done.
       If it failed, the row stays unstamped and the next run tries again —
       better a duplicate alert than a signup nobody ever hears about. */
    if (alertErr) {
      failures.push(`alert for ${r.email}: ${alertErr}`);
      log(`  ✗ ${r.email} — alert failed, leaving it for the next run`);
      continue;
    }

    const ageHours = (now().getTime() - new Date(r.created_at).getTime()) / 3600000;
    if (ageHours <= CONFIRM_WITHIN_HOURS) {
      const confirmErr = await send({
        from: SEND_FROM, to: [r.email], reply_to: REPLY_TO,
        subject: `You're on the list for ${wanted}`,
        html: confirmHtml(r),
      });
      /* A failed confirmation is worth knowing about but must not re-send
         Erika's alert forever, so the row is still stamped. */
      if (confirmErr) failures.push(`confirmation to ${r.email}: ${confirmErr}`);
    } else {
      log(`  · ${r.email} signed up ${Math.round(ageHours)}h ago — alerting only, no late confirmation`);
    }

    if (!dryRun) {
      const patch = await db(`waitlist?id=eq.${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ notified_at: now().toISOString() }),
      });
      /* Unstamped means it will be sent again in fifteen minutes. Say so
         rather than letting a silent duplicate look like a new signup. */
      if (!patch.ok) failures.push(`could not stamp ${r.email}: ${patch.status} ${await patch.text()} — it WILL be emailed again`);
    }

    sent++;
    log(`  ✓ ${r.name || r.email} — ${wanted}`);
  }

  if (failures.length) throw new Error("Some notifications failed:\n  " + failures.join("\n  "));
  return { sent, rows };
}

/* CLI */
if (import.meta.url === `file://${process.argv[1]}`) {
  const env = { ...process.env, DRY_RUN: process.argv.includes("--dry-run") ? "1" : "" };
  run({ fetch: globalThis.fetch, env })
    .then((r) => log_done(r))
    .catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
  function log_done(r) { console.log(`Done — ${r.sent} signup(s) notified.`); }
}
