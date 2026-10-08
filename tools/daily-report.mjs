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

/* Midnight Dallas today, as an instant. Built from the date parts rather than
   a fixed offset so it stays correct across the DST change in November. */
export function startOfDallasDay(now) {
  const day = dallasDay(now);                       // YYYY-MM-DD
  for (const offset of ["-05:00", "-06:00"]) {      // CDT then CST
    const t = new Date(`${day}T00:00:00${offset}`);
    if (dallasDay(t) === day) return t;
  }
  return new Date(`${day}T00:00:00-06:00`);
}

/* Which day the report is about. GitHub runs scheduled jobs hours late - in
   Aug-Oct 2026 the 8pm run started between midnight and 8am Dallas time, and
   the old "is it exactly 8pm?" gate skipped every one, so the report never
   sent. A run before noon now reports on yesterday, whole; a run after noon
   reports on today so far. Returns an instant inside the day to report. */
export function reportMoment(now) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? new Date(startOfDallasDay(now).getTime() - 60 * 1000) : now;
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

/* Who has used this week's kit - from kit_events, all-time for the kit, so
   the card answers "who still hasn't opened it?" rather than "who opened it
   today". Each teacher: opened / downloaded her Story / copied her poll
   answers or captions, and when she was last in. null = table not set up or
   unreadable, and the card is left out rather than reading as "nobody". */
export function kitCard(kitRows, faculty, label) {
  if (!kitRows) return "";
  const when = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const by = {};
  for (const r of kitRows) {
    const e = String(r.faculty_email || "").toLowerCase();
    const s = by[e] || (by[e] = { open: false, story: false, copies: 0, last: null });
    if (r.action === "open") s.open = true;
    if (r.action === "download") s.story = true;
    if (r.action === "copy") s.copies++;
    s.last = r.created_at;
  }
  const lines = faculty.map((f) => ({ f, s: by[f.email] }))
    .sort((a, b) => (b.s ? 1 : 0) - (a.s ? 1 : 0) || a.f.name.localeCompare(b.f.name))
    .map(({ f, s }) => {
      if (!s) return row(`○ ${esc(f.name)}`, `<span style="color:#B4503C;">not opened yet</span>`);
      const did = [s.story ? "downloaded her Story" : "no Story download",
                   s.copies ? `${s.copies} ${s.copies === 1 ? "copy" : "copies"}` : "nothing copied"].join(" · ");
      return row(`${s.story ? "✓" : "◐"} ${esc(f.name)} <span style="color:#5A5E55;">— ${did}</span>`, `last in ${esc(when(s.last))}`);
    }).join("");
  const missing = faculty.filter((f) => !by[f.email]).length;
  const note = quiet(missing
    ? `${missing} ${missing === 1 ? "teacher hasn't" : "teachers haven't"} opened it yet. A press-and-hold save of the picture doesn't show here, and none of this proves she posted — her screenshots do.`
    : "Everyone has opened it. A press-and-hold save doesn't show here, and none of this proves she posted — her screenshots do.") + '<div style="height:12px"></div>';
  return card(label, faculty.length ? note + lines : quiet("No faculty records to report on."));
}

/* SALES BY SOURCE - which link each sale came in on, from the utm tags the
   booking functions write on every enrollments row (2026-10-06-enrollments-
   ad-source.sql). One purchase = one order: a Stripe order writes a row per
   class (order_ref "cs_..." or "cs_...:<session>" / ":gift"), a Cal.com
   bundle a row per class under one booking uid - so rows are grouped by the
   part before ":" and their amounts added. $0 rows (bundle classes still
   owed, free redeems) count toward their order, not as sales of their own.
   null = the ledger could not be read; the card says so rather than "$0". */
const SOURCE_LABELS = {
  "facebook|paid_social": "Meta ads", "fb|paid_social": "Meta ads (Facebook)", "ig|paid_social": "Meta ads (Instagram)",
  "meta|paid": "Meta ads", "instagram|bio": "Instagram bio", "instagram|social": "Instagram post or story",
  "facebook|social": "Facebook post", "linkedin|social": "LinkedIn post", "newsletter|email": "Email or newsletter",
};
export function salesBySource(rows) {
  const orders = {};
  (rows || []).forEach((r, i) => {
    const id = String(r.order_ref || "").split(":")[0] || `row-${i}`;   // a row with no order is its own order
    const o = orders[id] || (orders[id] = { cents: 0, src: r.utm_source || "", med: r.utm_medium || "", camp: r.utm_campaign || "" });
    o.cents += Number(r.amount_cents) || 0;
  });
  const groups = {};
  for (const o of Object.values(orders)) {
    if (!(o.cents > 0)) continue;                       // nothing was paid on this order
    const key = o.src ? `${o.src}|${o.med}|${o.camp}` : "";
    const g = groups[key] || (groups[key] = { src: o.src, med: o.med, camp: o.camp, n: 0, cents: 0 });
    g.n++; g.cents += o.cents;
  }
  return Object.values(groups).sort((a, b) => b.cents - a.cents);
}
const money = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
function sourceLabel(g) {
  if (!g.src) return `<span style="color:#8A8E83;">No link tag</span> <span style="color:#8A8E83;font-size:12px;">(direct, a teacher link, or before tracking)</span>`;
  const name = SOURCE_LABELS[`${g.src}|${g.med}`.toLowerCase()] || `${esc(g.src)}${g.med ? ` · ${esc(g.med)}` : ""}`;
  return `${name}${g.camp ? ` <span style="color:#5A5E55;">— ${esc(g.camp)}</span>` : ""}`;
}
export function salesCard(todayRows, allRows, sinceLabel) {
  if (todayRows === null || allRows === null) {
    return card("Sales by source", `<p style="margin:0;line-height:1.65;color:#8A2B2B;font-weight:600;">The ledger could not be read — this is NOT "no sales".</p>`);
  }
  const block = (groups) => groups.map((g) => row(sourceLabel(g), `${g.n} ${g.n === 1 ? "sale" : "sales"} · ${money(g.cents)}`)).join("");
  const today = salesBySource(todayRows), all = salesBySource(allRows);
  const total = (gs) => gs.reduce((t, g) => t + g.cents, 0), count = (gs) => gs.reduce((t, g) => t + g.n, 0);
  return card("Sales by source",
    (today.length ? block(today) : quiet("No sales today.")) +
    `<div style="margin:18px 0 8px;font-size:12px;letter-spacing:.14em;color:#4F6B5C;text-transform:uppercase;">${esc(sinceLabel)} · ${count(all)} ${count(all) === 1 ? "sale" : "sales"} · ${money(total(all))}</div>` +
    (all.length ? block(all) : quiet("No sales yet.")));
}

/* A section that throws becomes a note saying so - the rest of the report
   still goes out. On 7 and 8 Oct 2026 one bad section stopped the whole email
   two mornings running, and silence read as "no report", not "broken". */
function safe(title, build) {
  try { return build(); } catch (e) {
    console.error(`section "${title}" failed:`, e && e.stack || e);
    return card(title, `<p style="margin:0;line-height:1.65;color:#8A2B2B;font-weight:600;">This section hit an error and was skipped: ${esc(e && e.message || e)}</p>`);
  }
}

export function buildReport({ now, posts, faculty, signups, referrals, sessionsToday, unbookable,
                              waitlistUnreadable = false, kitRows = null, salesToday = [], salesAll = [] }) {
  const parts = [];
  // Names are compared and printed below; a faculty row with no name at all must not break that.
  faculty = (faculty || []).map((f) => ({ ...f, name: String(f.name || f.email || "(no name)") }));

  // --- Sales by source (first: it's the number the campaign is judged on) ---
  parts.push(safe("Sales by source", () => salesCard(salesToday, salesAll, "Since the sale opened (Sept 29)")));

  // --- The Swarm ---
  //
  // The roster always prints, even on a silent day. A card that empties itself
  // when nobody posts hides exactly the thing worth seeing: WHO didn't. The
  // note explains the silence; the list names it.
  const posted = Object.keys(posts);
  parts.push(safe("The Swarm today", () => {
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
  return card("The Swarm today",
    faculty.length ? swarmNote + roster
                   : quiet("No faculty records to report on."));
  }));

  // --- This week's kit (only once kit_events exists) ---
  const kit = safe("Week 2 kit — who has it", () => kitCard(kitRows, faculty, "Week 2 kit — who has it"));
  if (kit) parts.push(kit);

  // --- Signups ---
  parts.push(safe("Signups today", () => card("Signups today",
    signups.length
      ? signups.map((s) => row(
          `${esc(s.name || s.email)} — <span style="color:#5A5E55;">${esc(s.class_name || "All classes")}</span>`,
          s.ref ? `via ${esc(s.ref)}` : `<span style="color:#C0BFB6;">no referral</span>`)).join("")
      /* "No signups today" and "the waitlist would not open" are opposite
         pieces of news, and only one of them is a quiet day. A single dead
         table is still just a missing section — but not a section that
         quietly reads as good news about the one number that matters. */
      : waitlistUnreadable
        ? `<p style="margin:0;line-height:1.65;color:#8A2B2B;font-weight:600;">The waitlist could not be read — this is NOT "no signups".</p>
           <p style="margin:8px 0 0 0;line-height:1.65;color:#5A5E55;">Supabase refused the read. Almost always a bad SUPABASE_SERVICE_ROLE_KEY: a publishable key hits row-level security and is refused, a secret key is not. Signups are still being saved, and nobody has been emailed about them.</p>`
        : quiet("No signups today."))));

  // --- Referral standings ---
  parts.push(safe("Referral standings", () => {
  const top = (referrals || []).filter((r) => r.signups > 0);
  return card("Referral standings",
    top.length
      ? top.slice(0, 10).map((r) => row(esc(r.ref), `${r.signups}`)).join("")
      : quiet("No referral code has brought in a signup yet. Every waitlist row so far arrived with no code attached — worth checking that the faculty links in bios actually carry ?ref="));
  }));

  // --- Schedule ---
  parts.push(safe("The schedule", () => {
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
  return card("The schedule", scheduleInner.join(""));
  }));

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
    waitlistUnreadable
      ? "WAITLIST UNREADABLE"
      : `${signups.length} signup${signups.length === 1 ? "" : "s"}`,
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

  // The day being reported, which is yesterday for a morning run - and if
  // so, nothing from this morning counts towards it.
  const ranAt = now;
  now = reportMoment(ranAt);
  const since = startOfDallasDay(now).toISOString();
  const until = now === ranAt ? null : startOfDallasDay(ranAt).toISOString();
  const today = dallasDay(now);

  /* Which reads were refused, as opposed to genuinely empty. The two look
     identical downstream — both arrive as [] — and for the waitlist that
     difference is the whole report. */
  const refused = new Set();

  const get = async (path) => {
    const table = path.split("?")[0];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    /* A table that doesn't exist yet must not kill the whole report — the
       Swarm board tables were added later than the rest. Missing section,
       not a missing email. */
    if (!r.ok) { refused.add(table); log(`  (skipping ${table}: ${r.status})`); return []; }
    return r.json();
  };

  const [faculty, activity, signups, referrals, sessions, kitRaw] = await Promise.all([
    get("faculty?select=email,display_name,full_name"),
    get(`campaign_activity?select=faculty_email&day_key=eq.${today}`),
    get(`waitlist?select=name,email,class_name,ref,created_at&created_at=gte.${since}${until ? `&created_at=lt.${until}` : ""}&order=created_at.asc`),
    get("referral_counts?select=ref,signups&order=signups.desc"),
    get("class_sessions?select=*&status=neq.canceled"),
    // Who has used the Week 2 kit, all-time (supabase/sql/2026-10-06-kit-events.sql).
    get(`kit_events?select=faculty_email,action,item,created_at&kit=eq.week2&created_at=lt.${until || ranAt.toISOString()}&order=created_at.asc`),
  ]);
  // Table not created yet (or refused) = leave the card out, not "nobody opened it".
  const kitRows = refused.has("kit_events") ? null : kitRaw;

  // Sales by source: today's purchases, and everything since the sale opened.
  const salesCols = "select=order_ref,amount_cents,utm_source,utm_medium,utm_campaign,created_at";
  const end = until || ranAt.toISOString();
  const salesAllRaw = await get(`enrollments?${salesCols}&created_at=gte.2026-09-29T05:00:00Z&created_at=lt.${end}`);
  const salesAll = refused.has("enrollments") ? null : salesAllRaw;
  const salesToday = salesAll === null ? null : salesAll.filter((r) => String(r.created_at || "") >= since);

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

  const sessionsToday = sessions.filter((s) => String(s.created_at || "") >= since
    && (!until || String(s.created_at || "") < until));

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
    now, posts, faculty: roster, signups, referrals, sessionsToday, unbookable,
    waitlistUnreadable: refused.has("waitlist"),
    kitRows, salesToday, salesAll,
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
    .catch((e) => {
      console.error("FAILED:", e.message);
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=Daily report not sent::${String(e.message).replace(/\r?\n/g, " ").slice(0, 400)}`);
      process.exit(1);
    });
}
