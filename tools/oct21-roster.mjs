/**
 * October 21 class lists for the teachers.
 *
 * WHY THIS EXISTS
 * The 21st is booked on oct21.html, not Cal.com, so no teacher sees her
 * students in Cal.com. Each booking emails her as it happens, and an online
 * student only gets her video link if the teacher replied to that one email.
 * Nothing caught a missed reply (hardening review, 6 Oct). Erika's call: one
 * list per class, the day before, to the teacher with Erika copied.
 *
 * TWO SENDS
 *   first - Tuesday 20 Oct, morning: who is booked so far. Online students'
 *           emails in one line to paste into a single email with the link.
 *   final - Wednesday 21 Oct, after midnight, when sales have closed: the
 *           complete list, so late bookings are not missed.
 * Each send happens once. .github/workflows/oct21-roster.yml fires several
 * times (GitHub drops scheduled runs) and commits a marker file after a send;
 * a run that finds the marker does nothing.
 *
 * SECRETS: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (same as the daily report).
 *
 *   node tools/oct21-roster.mjs --phase first --dry-run
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const SUPABASE_URL = "https://pmpaslevwimofohirves.supabase.co";
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const ERIKA = "erika@quintaand.co";
const DAY = "2026-10-21";
const TZ = "America/Chicago";

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function clock(t) {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}
export function dallasDay(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
/* Which send is due today, from the Dallas date. null means not today.
   headcount - Monday 19 Oct, to Erika only: the two-person minimum check.
   oct21.html and every confirmation email promise that a class under two is
   told "by Monday, October 19", so this is the morning she needs the count. */
export function phaseFor(now) {
  const d = dallasDay(now);
  return d === "2026-10-19" ? "headcount" : d === "2026-10-20" ? "first" : d === DAY ? "final" : null;
}

/* Erika's Monday headcount: every session, how many are booked, and - for
   any under two - who to write to. One email, to her only. */
export function buildHeadcount(sessions, seats) {
  const MIN = 2;
  const rows = sessions.map((s) => {
    const mine = seats.filter((x) => x.session_id === s.id);
    const online = mine.filter((x) => x.attending === "online").length;
    return { s, mine, n: mine.length, online, short: mine.length < MIN };
  });
  const short = rows.filter((r) => r.short);
  const who = (r) => String(r.s.instructor_name || "").split(/\s+/)[0] || "no teacher";
  const label = (r) => `${clock(r.s.start_time)} · ${r.s.class_name} (${who(r)})`;
  const status = (r) => r.n >= MIN ? "Running" : r.n === 1 ? "Needs one more" : "No one yet";

  const table = rows.map((r) =>
    `<tr><td style="padding:7px 14px 7px 0">${esc(label(r))}</td>` +
    `<td style="padding:7px 14px 7px 0;text-align:right"><strong>${r.n}</strong>${r.online ? ` <span style="color:#5A5E55">(${r.online} online)</span>` : ""}</td>` +
    `<td style="padding:7px 0;${r.short ? "color:#9C3B2E;font-weight:bold" : "color:#4F6B5C"}">${status(r)}</td></tr>`).join("");
  const shortHtml = short.filter((r) => r.n > 0).map((r) =>
    `<p style="margin:16px 0 4px"><strong>${esc(label(r))}</strong></p>` +
    `<p style="margin:0 0 8px">${r.mine.map((x) => `${esc(x.student_name || "(no name)")} &lt;${esc(x.student_email)}&gt;`).join("<br>")}</p>`).join("");

  const lead = short.length
    ? `${short.length} ${short.length === 1 ? "class is" : "classes are"} under the two-person minimum. The booking page and every confirmation email promise those students a heads-up <strong>today</strong>, with their choice of a full refund or a seat in the next round.`
    : "Every class has at least two people. Nothing to send anyone today.";
  const html = `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:600px">
    <p style="margin:0 0 16px">${lead}</p>
    <table style="border-collapse:collapse;font-size:15px;margin:0 0 18px">${table}</table>
    ${shortHtml ? `<p style="margin:22px 0 0;font-family:Georgia,serif;font-size:17px">Who to write to</p>${shortHtml}` : ""}
    <p style="margin:22px 0 0;font-size:14px;color:#5A5E55">Booking is still open until midnight on Tuesday, so a
      class can still reach two after this. Classes with no one booked have no one to tell - decide whether
      to keep them on the page. Teachers get their own lists tomorrow morning.</p>
    <p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co. · October 21 headcount</p></div>`;
  const text = lead.replace(/<[^>]+>/g, "") + "\n\n"
    + rows.map((r) => `- ${label(r)}: ${r.n}${r.online ? ` (${r.online} online)` : ""} - ${status(r)}`).join("\n")
    + (short.some((r) => r.n > 0) ? "\n\nWHO TO WRITE TO\n" + short.filter((r) => r.n > 0).map((r) =>
        `${label(r)}\n` + r.mine.map((x) => `  ${x.student_name || "(no name)"} <${x.student_email}>`).join("\n")).join("\n") : "")
    + "\n\nBooking stays open until midnight Tuesday, so a class can still reach two.\n";
  return {
    to: ERIKA,
    subject: short.length
      ? `October 21 headcount: ${short.length} ${short.length === 1 ? "class" : "classes"} under two - tell them today`
      : "October 21 headcount: every class is running",
    html, text,
  };
}

/* One email per session. `students` are that session's ledger rows. */
export function buildRoster(session, students, phase) {
  const teacher = String(session.instructor_name || "").split(/\s+/)[0] || "there";
  const when = `${session.class_name}, ${clock(session.start_time)}`;
  const sorted = students.slice().sort((a, b) =>
    String(a.student_name || a.student_email).localeCompare(String(b.student_name || b.student_email)));
  const online = sorted.filter((s) => s.attending === "online");
  const n = sorted.length;
  const count = `${n} ${n === 1 ? "student" : "students"}${online.length ? `, ${online.length} online` : ""}`;

  const lead = phase === "final"
    ? "Booking for October 21 has closed, so this is your complete list."
    : "Here's who is booked so far. Booking stays open until midnight tonight - you'll get the complete list then.";
  const rows = sorted.map((s) =>
    `<tr><td style="padding:6px 12px 6px 0">${esc(s.student_name || "(no name given)")}</td>` +
    `<td style="padding:6px 12px 6px 0">${esc(s.student_email)}</td>` +
    `<td style="padding:6px 0">${s.attending === "online" ? "<strong>Online</strong>" : "In person"}</td></tr>`).join("");
  const onlineBox = online.length
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#EEF2EC;border-left:3px solid #4F6B5C">
         <strong>Send your video link to ${online.length === 1 ? "this student" : `these ${online.length} students`}${phase === "final" ? " if you haven't yet" : " today"}.</strong>
         Paste this into the To line of one email:<br><span style="font-family:monospace">${esc(online.map((s) => s.student_email).join(", "))}</span></p>`
    : "";
  const html = `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:560px">
    <p style="margin:0 0 16px">Hi ${esc(teacher)},</p>
    <p style="margin:0 0 16px"><strong>${esc(when)}</strong> on Wednesday, October 21 &middot; ${esc(count)}.</p>
    <p style="margin:0 0 16px">${esc(lead)}</p>
    ${onlineBox}
    ${n ? `<table style="border-collapse:collapse;font-size:15px;margin:0 0 18px">${rows}</table>`
        : `<p style="margin:0 0 16px">Nobody has booked this class yet.</p>`}
    <p style="margin:0 0 16px;font-size:14px;color:#5A5E55">On the day, show your class's QR slide from the
      portal at the start - students scan it and type their name, and that's the attendance record.
      Anyone who turns up and isn't on this list: let them in and tell Erika.</p>
    <p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co. · Dallas, Texas</p></div>`;
  const text = `Hi ${teacher},\n\n${when} on Wednesday, October 21 - ${count}.\n\n${lead}\n\n`
    + (online.length ? `SEND YOUR VIDEO LINK TO: ${online.map((s) => s.student_email).join(", ")}\n\n` : "")
    + (n ? sorted.map((s) => `- ${s.student_name || "(no name given)"}  ${s.student_email}  ${s.attending === "online" ? "ONLINE" : "in person"}`).join("\n")
         : "Nobody has booked this class yet.") + "\n";
  return {
    to: session.instructor_email || ERIKA,
    subject: `${phase === "final" ? "Final list" : "Your class list"}: ${when}, October 21 (${count})`,
    html, text,
  };
}

export async function run({ fetch, env, now = new Date(), phase, dryRun = false, log = console.log, markerDir = "tools/state" }) {
  phase = phase || phaseFor(now);
  if (!phase) { log(`Not a roster day in Dallas (${dallasDay(now)}) - nothing to do.`); return { sent: 0 }; }
  const marker = `${markerDir}/oct21-roster-${phase}.sent`;
  if (existsSync(marker) && !dryRun) { log(`The ${phase} list already went out (${marker}) - nothing to do.`); return { sent: 0 }; }

  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || (!env.RESEND_API_KEY && !dryRun)) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY");
  const get = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  // status IS NULL counts as running - neq alone would drop those rows.
  const sessions = await get(`class_sessions?session_date=eq.${DAY}&or=(status.is.null,status.neq.canceled)`
    + `&select=id,class_name,start_time,instructor_email,instructor_name&order=start_time.asc`);
  if (!sessions.length) throw new Error(`No sessions found on ${DAY} - refusing to send nothing.`);
  const ids = sessions.map((s) => s.id).join(",");
  const seats = await get(`enrollments?session_id=in.(${ids})&status=in.(booked,taken)`
    + `&select=session_id,student_name,student_email,attending`);

  let sent = 0;
  if (phase === "headcount") {
    const mail = buildHeadcount(sessions, seats);
    if (dryRun) { log(`[dry run] to ${mail.to}: ${mail.subject}`); return { sent: 0, phase }; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: SEND_FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!r.ok) throw new Error(`Resend refused the headcount: ${r.status} ${await r.text()}`);
    log(`Sent - ${mail.subject}`);
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(marker, `Sent the headcount at ${now.toISOString()}\n`);
    return { sent: 1, phase };
  }
  for (const s of sessions) {
    const mail = buildRoster(s, seats.filter((x) => x.session_id === s.id), phase);
    if (dryRun) { log(`[dry run] to ${mail.to}: ${mail.subject}`); continue; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: SEND_FROM, to: [mail.to], cc: mail.to === ERIKA ? undefined : [ERIKA],
                             reply_to: ERIKA, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!r.ok) throw new Error(`Resend refused the list for ${s.class_name}: ${r.status} ${await r.text()}`);
    log(`Sent - ${mail.subject} -> ${mail.to}`);
    sent++;
  }
  if (!dryRun) {
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(marker, `Sent ${sent} class lists at ${now.toISOString()}\n`);
  }
  return { sent, phase };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("oct21-roster.mjs")) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
  run({ fetch: globalThis.fetch, env: process.env, phase: arg("--phase"), dryRun: process.argv.includes("--dry-run") })
    .catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
}
