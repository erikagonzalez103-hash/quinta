/**
 * Books Before Bubbly (15 Dec 2026) seat watch.
 *
 * Each class can be booked through more than one Cal.com link - on its own,
 * as the first class of a bundle, and as a bundle's $0 second class - and
 * Cal.com counts seats per link, not per class. So no single page shows how
 * many people are actually coming to, say, Bookkeeping 2. This adds the
 * links up and emails erika@quintaand.co when any class reaches 18 people
 * (Erika, 17 Nov: "keep the seats as is, watch the numbers").
 *
 * Emails once at 18, then again each time that class adds a person, never
 * twice for the same number. The last number emailed per class is kept in
 * STATE_FILE (carried between runs by the workflow's cache).
 *
 * How many are booked: Cal.com's slots API gives seatsTotal and
 * seatsRemaining for the day's time. A link with no time showing is full (or
 * was closed by hand) - counted as full, and said so in the email.
 *
 * SECRETS: CAL_API_KEY, RESEND_API_KEY
 * RUN BY HAND: node tools/bbb-seat-watch.mjs --dry-run   (prints, sends nothing)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const NOTIFY_TO = "erika@quintaand.co";
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const EVENT_DAY = "2026-12-15";
const LAST_WATCH_DAY = "2026-12-14";   // Cal.com can hide same-day times, which would read as "full"
export const ALERT_AT = 18;
export const ROOM = 20;                // seats per class, room + online

export const CLASSES = [
  { key: "bk1", name: "Bookkeeping 1 (10:00 a.m., Tara)", links: [
    ["bookkeeping-1-bbb", "booked on its own"],
    ["keep-the-books-bbb", "Keep the Books bundle"],
  ] },
  { key: "bk2", name: "Bookkeeping 2 (11:30 a.m., Tara)", links: [
    ["bookkeeping-2-bbb", "booked on its own"],
    ["books-to-taxes-bbb", "Books to Taxes bundle"],
    ["bookkeeping-2-bbb-redeem", "Keep the Books bundle, 2nd class"],
  ] },
  { key: "tax", name: "Year-End Tax Readiness (1:30 p.m., Lupe)", links: [
    ["year-end-tax-bbb", "booked on its own"],
    ["year-end-tax-bbb-redeem", "Books to Taxes bundle, 2nd class"],
  ] },
];

/* One link's numbers from a /v2/slots response for the event day. */
export function seatsFromSlots(json) {
  const slots = Object.values(json?.data || {}).flat();
  if (!slots.length) return { booked: null, total: null, showing: false };
  const s = slots[0];
  const total = Number(s.seatsTotal), left = Number(s.seatsRemaining);
  if (!Number.isFinite(total) || !Number.isFinite(left)) throw new Error("slots answer has no seat counts");
  return { booked: total - left, total, showing: true };
}

/* Per class: who's coming, and whether this run should email. */
export function assess(perLink, state) {
  return CLASSES.map((c) => {
    const parts = c.links.map(([slug, label]) => {
      const r = perLink[slug];
      // no time showing = full or closed; count the whole pool so we never under-report
      const booked = r.showing ? r.booked : (r.total ?? ROOM);
      return { slug, label, booked, showing: r.showing };
    });
    const count = parts.reduce((n, p) => n + p.booked, 0);
    const last = Number(state[c.key] || 0);
    return { ...c, parts, count, alert: count >= ALERT_AT && count > last };
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function buildEmail(rows) {
  const hot = rows.filter((r) => r.alert);
  const subject = "Books Before Bubbly: " + hot.map((r) => `${r.name.split(" (")[0]} has ${r.count} people`).join("; ");
  const table = rows.map((r) => `
    <tr><td style="padding:10px 0 2px;font-weight:bold;${r.alert ? "color:#9C1519" : ""}">${esc(r.name)}: ${r.count} of ${ROOM}${r.count > ROOM ? " (over)" : ""}</td></tr>
    ${r.parts.map((p) => `<tr><td style="padding:0 0 0 14px;color:#5A5E55;font-size:14px">${p.booked} · ${esc(p.label)}${p.showing ? "" : " (no time showing in Cal.com: full, or closed)"}</td></tr>`).join("")}`).join("");
  const html = `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:540px">
    <p style="margin:0 0 14px">${hot.length > 1 ? "Two or more Books Before Bubbly classes are" : "A Books Before Bubbly class is"} close to the 20-seat room.</p>
    <table style="border-collapse:collapse">${table}</table>
    <p style="margin:18px 0 0">Cal.com counts each link separately, so it will keep selling past 20. To stop at the room size, turn off the links for that class in Cal.com (Event Types &rarr; toggle "Hidden"), or ask Claude to do it.</p>
    <p style="margin:18px 0 0;color:#8A8E83;font-size:13px">Seat watch, every 2 hours until December 14. You get one email per new person once a class reaches ${ALERT_AT}.</p>
  </div>`;
  return { subject, html };
}

export async function run({ fetch, env, today, log = console.log }) {
  const dryRun = !!env.DRY_RUN;
  if (today > LAST_WATCH_DAY) { log(`Event week is over (${today}); nothing to watch.`); return; }
  const missing = ["CAL_API_KEY", ...(dryRun ? [] : ["RESEND_API_KEY"])].filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing secret(s): ${missing.join(", ")}`);

  const perLink = {};
  for (const c of CLASSES) for (const [slug] of c.links) {
    const url = `https://api.cal.com/v2/slots?eventTypeSlug=${slug}&username=quintaandco`
      + `&start=${EVENT_DAY}&end=2026-12-16&timeZone=America/Chicago`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${env.CAL_API_KEY}`, "cal-api-version": "2024-09-04" } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.status !== "success") throw new Error(`Cal.com ${slug}: ${r.status} ${JSON.stringify(body.error || body).slice(0, 200)}`);
    perLink[slug] = seatsFromSlots(body);
  }

  const stateFile = env.STATE_FILE || ".bbb-seat-watch/state.json";
  let state = {};
  try { state = JSON.parse(readFileSync(stateFile, "utf8")); } catch { /* first run */ }
  const rows = assess(perLink, state);
  for (const r of rows) log(`${r.name}: ${r.count} (${r.parts.map((p) => `${p.slug}=${p.booked}${p.showing ? "" : "*"}`).join(", ")})${r.alert ? "  <- ALERT" : ""}`);

  if (!rows.some((r) => r.alert)) { log("No class at a new count of 18 or more."); return; }
  const { subject, html } = buildEmail(rows);
  if (dryRun) { log(`[dry run] would send: ${subject}`); return; }

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SEND_FROM, to: [NOTIFY_TO], subject, html }),
  });
  if (!send.ok) throw new Error(`Resend refused the alert: ${send.status} ${await send.text()}`);
  log(`Sent: ${subject}`);
  for (const r of rows) if (r.alert) state[r.key] = r.count;
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  run({ fetch: globalThis.fetch, env: { ...process.env, DRY_RUN: process.argv.includes("--dry-run") ? "1" : "" }, today })
    .catch((e) => {
      console.error("FAILED:", e.message);
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=Seat watch failed::${String(e.message).replace(/\r?\n/g, " ").slice(0, 400)}`);
      process.exit(1);
    });
}
