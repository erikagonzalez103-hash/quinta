/**
 * Quinta & Co. — the end-of-day report
 *
 * One email to erika@quintaand.co at 8pm Dallas, answering the four questions
 * that otherwise need four dashboards and a SQL editor:
 *
 *   Who posted today?           the Swarm board, in an email
 *   Who signed up?              waitlist rows since this morning
 *   Who's it credited to?       referral standings, and today's movement
 *   What's scheduled?           class dates set today, and any that synced
 *                               but are NOT bookable — the silent failure
 *                               the Worker catches and nobody reads
 *
 * WHY IT SAYS SO WHEN NOTHING HAPPENED
 * A quiet day is information. "No signups today" is the sentence that tells
 * you the campaign isn't landing, and a report that only arrives on good days
 * teaches you nothing. It sends every day, and says plainly when a day was
 * empty.
 *
 * SECRETS: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
 * RUN BY HAND: node tools/daily-report.mjs [--dry-run]
 */

const SUPABASE_URL = "https://pmpaslevwimofohirves.supabase.co";
const NOTIFY_TO = "erika@quintaand.co";
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const TZ = "America/Chicago";

export function dallasDay(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
export function prettyDay(d) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric",
  }).format(d);
}
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Midnight Dallas at the start of a given YYYY-MM-DD, as an instant. Built
   from the date parts rather than a fixed offset so it stays correct across
   the DST change in November. */
export function startOfDallasDate(day) {
  for (const offset of ["-05:00", "-06:00"]) {      // CDT then CST
    const t = new Date(`${day}T00:00:00${offset}`);
    if (dallasDay(t) === day) return t;
  }
  return new Date(`${day}T00:00:00-06:00`);
}

/* Midnight Dallas on the day `now` falls in. */
export function startOfDallasDay(now) {
  return startOfDallasDate(dallasDay(now));
}

/* Calendar arithmetic on a Dallas date, done on the date string so it never
   picks up an offset. Midday UTC is far from either midnight, so adding or
   subtracting whole days can't slip into a neighbouring date. */
export function shiftDallasDate(day, delta) {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

const card = (title, inner) => `
  <div style="background:#FFFFFF;border:1px solid #DCD7CB;border-radius:4px;padding:24px 26px;margin-bottom:18px;">
    <div style="font-size:11px;letter-spacing:.28em;color:#4F6B5C;text-transform:uppercase;margin-bottom:14px;">${esc(title)}</div>
    ${inner}
  </div>`;

const quiet = (t) => `<p style="margin:0;color:#8A8E83;font-style:italic;line-height:1.6;">${esc(t)}</p>`;

const row = (left, right) => `
  <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #F0EDE4;font-size:14px;">
    <span>${left}</span><span style="color:#5A5E55;white-space:nowrap;">${right}</span>
  </div>`;

export function buildReport({ now, posts, faculty, signups, referrals, sessionsToday, unbookable }) {
  const parts = [];

  // --- The Swarm ---
  //
  // The roster always prints, even on a silent day. A card that empties itself
  // when nobody posts hides exactly the thing worth seeing: WHO didn't. The
  // note explains the silence; the list names it.
  const posted = Object.keys(posts);
  const roster = faculty
    .map((f) => ({ f, n: posts[f.email] || 0 }))
    .sort((a, b) => b.n - a.n || a.f.name.localeCompare(b.f.name))
    .map(({ f, n }) => row(
      `${n > 0 ? "✓" : "○"} ${esc(f.name)}`,
      n > 0 ? `${n} marked done` : `<span style="color:#C0BFB6;">nothing yet</span>`))
    .join("");
  const swarmNote = posted.length
    ? ""
    : quiet("Nobody marked a post done today. If the faculty are posting without ticking the box, the board can't tell — worth a nudge in the group text.") + '<div style="height:12px"></div>';
  parts.push(card("The Swarm today",
    faculty.length ? swarmNote + roster
                   : quiet("No faculty records to report on.")));

  // --- Signups ---
  parts.push(card("Signups today",
    signups.length
      ? signups.map((s) => row(
          `${esc(s.name || s.email)} — <span style="color:#5A5E55;">${esc(s.class_name || "All classes")}</span>`,
          s.ref ? `via ${esc(s.ref)}` : `<span style="color:#C0BFB6;">no referral</span>`)).join("")
      : quiet("No signups today.")));

  // --- Referral standings ---
  const top = referrals.filter((r) => r.signups > 0);
  parts.push(card("Referral standings",
    top.length
      ? top.slice(0, 10).map((r) => row(esc(r.ref), `${r.signups}`)).join("")
      : quiet("No referral code has brought in a signup yet. Every waitlist row so far arrived with no code attached — worth checking that the faculty links in bios actually carry ?ref=.")));

  // --- Schedule ---
  const scheduleInner = [];
  if (sessionsToday.length) {
    scheduleInner.push(`<div style="margin-bottom:10px;font-size:14px;color:#5A5E55;">Dates added today:</div>`);
    scheduleInner.push(sessionsToday.map((s) => row(
      `${esc(s.class_name)} — ${esc(s.session_date)} ${esc(String(s.start_time).slice(0, 5))}`,
      esc(s.instructor_name || s.instructor_email))).join(""));
  }
  if (unbookable.length) {
    /* The reason this section exists at all. The Worker already checks whether
       Cal.com will really offer the slot and writes the answer down; until now
       nobody read it, so a date could sit there looking scheduled and be
       unbookable for weeks. */
    scheduleInner.push(`
      <div style="background:#FBEEEC;border-left:2px solid #E4B7AE;padding:14px 18px;margin-top:16px;font-size:14px;line-height:1.6;">
        <strong style="color:#B4503C;">${unbookable.length} scheduled ${unbookable.length === 1 ? "date is" : "dates are"} NOT bookable</strong><br>
        ${unbookable.map((s) => `${esc(s.class_name)} — ${esc(s.session_date)} ${esc(String(s.start_time).slice(0, 5))}${s.note ? `<br><span style="color:#8A8E83;">${esc(s.note)}</span>` : ""}`).join("<br>")}
      </div>`);
  }
  if (!scheduleInner.length) scheduleInner.push(quiet("No dates added today, and nothing scheduled is failing to be bookable."));
  parts.push(card("The schedule", scheduleInner.join("")));

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quinta — ${esc(prettyDay(now))}</title></head>
<body style="font-family:Georgia,'Times New Roman',serif;background:#FAFAF6;color:#2F332E;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:26px;">
      <div style="font-size:11px;letter-spacing:.32em;color:#4F6B5C;text-transform:uppercase;">Quinta &amp; Co.</div>
      <h1 style="font-size:24px;color:#20231F;margin:8px 0 0 0;letter-spacing:.04em;">${esc(prettyDay(now))}</h1>
    </div>
    ${parts.join("")}
    <p style="text-align:center;color:#8A8E83;font-size:12px;font-style:italic;line-height:1.6;margin-top:22px;">
      Sent every evening from the repo, whether the news is good or not.<br>
      To change what's in here, edit tools/daily-report.mjs.
    </p>
  </div></body></html>`;

  const headline = [
    `${signups.length} signup${signups.length === 1 ? "" : "s"}`,
    `${posted.length}/${faculty.length} posted`,
    unbookable.length ? `${unbookable.length} unbookable` : null,
  ].filter(Boolean).join(" · ");

  return { html, subject: `Quinta — ${prettyDay(now)} — ${headline}` };
}

/* ------------------------------------------------------------------ run -- */

export async function run({ fetch, env, log = console.log, now = new Date() }) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = !!env.DRY_RUN;
  const missing = ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"].filter((k) => !env[k]);
  if (missing.length && !dryRun) throw new Error(`Missing secret(s): ${missing.join(", ")}`);

  /* WHICH DAY THIS REPORT IS ABOUT — and why it is not "now".
     GitHub delivers scheduled runs on a best-effort basis, and on this repo
     that has meant 9 to 11 hours late: a 01:00 UTC cron landing at noon. The
     old gate asked "is it 8pm in Dallas?", the answer was 05, 07, 07, 08 on
     four consecutive runs, and the send step was skipped every time while the
     job still reported success. Four days of green ticks, no report sent, and
     nothing anywhere saying so.
     So the report no longer asks what time it is. It reports the Dallas day
     that has just ended, bounded at both ends, which is the same complete day
     whether the run fires on time or half a day late. Only a delay past the
     NEXT Dallas midnight could shift it, which is twice the worst seen.
     REPORT_DATE names a specific day instead, for a backfill or a re-send. */
  const requested = String(env.REPORT_DATE || "").trim();
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    throw new Error(`REPORT_DATE must look like YYYY-MM-DD, got "${requested}".`);
  }
  const today = requested || shiftDallasDate(dallasDay(now), -1);
  const since = startOfDallasDate(today).toISOString();
  const until = startOfDallasDate(shiftDallasDate(today, 1)).toISOString();
  /* Midday on the reported day, so the headline and subject name that day
     rather than whenever the runner happened to pick the job up. */
  const asOf = new Date(startOfDallasDate(today).getTime() + 12 * 3600 * 1000);
  log(`Reporting on ${today} (Dallas).`);

  const get = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    /* A table that doesn't exist yet must not kill the whole report — the
       Swarm board tables were added later than the rest. Missing section,
       not a missing email. */
    if (!r.ok) { log(`  (skipping ${path.split("?")[0]}: ${r.status})`); return []; }
    return r.json();
  };

  const [faculty, activity, signups, referrals, sessions] = await Promise.all([
    get("faculty?select=email,display_name,full_name"),
    get(`campaign_activity?select=faculty_email&day_key=eq.${today}`),
    get(`waitlist?select=name,email,class_name,ref,created_at&created_at=gte.${since}&created_at=lt.${until}&order=created_at.asc`),
    get("referral_counts?select=ref,signups&order=signups.desc"),
    get("class_sessions?select=*&status=neq.canceled"),
  ]);

  /* Every table failing is not "a quiet day", it is a broken key — and a
     report that cheerfully says "No signups today" when the database was
     never reachable is worse than no report at all. A partial failure still
     degrades to a missing section; a total one says so.
     Found the hard way: the first live run returned 403 on all five tables
     and would have sent a blank report as though nothing had happened. */
  const reads = [faculty, activity, signups, referrals, sessions];
  if (reads.every((r) => r.length === 0)) {
    throw new Error(
      "Every database read came back empty or refused — almost certainly a bad " +
      "SUPABASE_SERVICE_ROLE_KEY (a publishable key hits row-level security and " +
      "returns 403; a secret key bypasses it). Refusing to send a report that " +
      "would read as a quiet day."
    );
  }

  const posts = {};
  for (const a of activity) {
    const e = String(a.faculty_email || "").toLowerCase();
    if (e) posts[e] = (posts[e] || 0) + 1;
  }

  const roster = faculty.map((f) => ({
    email: String(f.email || "").toLowerCase(),
    name: f.display_name || f.full_name || f.email,
  }));

  const sessionsToday = sessions.filter((s) => {
    const c = String(s.created_at || "");
    return c >= since && c < until;
  });

  /* Whichever column the Worker writes its verdict into — it lives in the
     database, not this repo, so try the names it might use and settle for
     none of them rather than guessing wrong. */
  const okCol = ["sync_ok", "bookable", "is_bookable", "verified_bookable", "cal_ok"]
    .find((c) => sessions.length && Object.prototype.hasOwnProperty.call(sessions[0], c));
  const noteCol = ["sync_note", "bookable_note", "sync_message", "cal_note"]
    .find((c) => sessions.length && Object.prototype.hasOwnProperty.call(sessions[0], c));

  const unbookable = okCol
    ? sessions
        .filter((s) => s[okCol] === false && String(s.session_date) >= today)
        .map((s) => ({ ...s, note: noteCol ? s[noteCol] : null }))
    : [];
  if (!okCol && sessions.length) log("  (no verdict column on class_sessions — skipping the unbookable check)");

  const { html, subject } = buildReport({
    now: asOf, posts, faculty: roster, signups, referrals, sessionsToday, unbookable,
  });

  if (dryRun) { log(`[dry run] subject: ${subject}`); return { subject, html }; }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SEND_FROM, to: [NOTIFY_TO], subject, html }),
  });
  if (!r.ok) throw new Error(`Resend refused the report: ${r.status} ${await r.text()}`);
  log(`Sent — ${subject}`);
  return { subject, html };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run({ fetch: globalThis.fetch, env: { ...process.env, DRY_RUN: process.argv.includes("--dry-run") ? "1" : "" } })
    .catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
}
