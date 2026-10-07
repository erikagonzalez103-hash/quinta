/*
 * Quinta & Co. — publish class edits from the faculty portal
 *
 * WHAT IT DOES
 * Teachers (and Erika) edit a class's description, "What we'll cover",
 * "What you'll walk out with" and "Know before you go" in the portal
 * (faculty/class-edit.html). Saving writes one row per class to the
 * class_edits table. This reads those rows and makes classes.js say the same
 * thing, then rebuilds the class pages and bumps the cache version - so the
 * words are in the real HTML, where search engines and AI answer engines read
 * them, not painted in by a script. The class page also reads the saved
 * text when it loads (tools/build-class-pages.mjs), so a teacher sees her
 * change at once; this is what makes it permanent. Scheduled every 10 minutes
 * (GitHub often runs it later than that) from
 * .github/workflows/publish-class-edits.yml, which commits what changed.
 *
 * ONCE A CLASS HAS BEEN EDITED IN THE PORTAL, THE PORTAL OWNS THOSE FOUR
 * FIELDS. A hand edit to them in classes.js is put back to the portal's text
 * on the next run. Change them in the portal (Erika can edit any class).
 * Everything else about the class - name, price, length, dates, disclaimer -
 * is still edited here by hand.
 *
 * NEEDS NO SECRETS to publish: the class text is public, so the public key
 * reads it. RESEND_API_KEY is only for the email telling Erika what changed.
 *
 * RUN BY HAND
 *   node tools/publish-class-edits.mjs --dry-run   see what it would change
 *   node tools/publish-class-edits.mjs             change it (then commit)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { bumpText, walk } from "./sync-class-dates.mjs";

const SUPABASE_URL = "https://pmpaslevwimofohirves.supabase.co";
const PUBLIC_KEY = "sb_publishable_t7U8S0paeslz99Y600_ixA_PHauIQcf";   // public by design
const NOTIFY_TO = "erika@quintaand.co";
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";

/* ------------------------------------------------------------ pure parts -- */

export function loadClasses(src) {
  globalThis.window = globalThis;
  return new Function(src + "; return typeof QUINTA_CLASSES !== 'undefined' ? QUINTA_CLASSES : undefined;")();
}

/* The edit as classes.js would hold it. */
export function wanted(row) {
  const clean = (s) => (s == null ? "" : String(s).trim());
  return {
    desc: clean(row.description),
    covers: (row.covers || []).map(clean).filter(Boolean),
    walkout: clean(row.walkout),
    prereq: clean(row.prereq),
    minutes: Number.isInteger(row.minutes) ? row.minutes : null,   // null = length not changed in the portal
  };
}

/* "90 minutes · live, small group" -> 90. null when the line has no minutes. */
export function minutesOf(format) {
  const m = String(format || "").match(/^\s*(\d+)\s*min/i);
  return m ? Number(m[1]) : null;
}
/* The same line with a new number of minutes; the rest of it is kept. */
export function withMinutes(format, minutes) {
  const f = String(format || "");
  return minutesOf(f) !== null ? f.replace(/^\s*\d+\s*minutes?/i, `${minutes} minutes`) : `${minutes} minutes · live, small group`;
}

export function textDiffers(c, w) {
  return (c.desc || "") !== w.desc
    || JSON.stringify(c.covers || []) !== JSON.stringify(w.covers)
    || (c.walkout || "") !== w.walkout
    || (c.prereq || "") !== w.prereq;
}
export function lengthDiffers(c, w) {
  return w.minutes !== null && minutesOf(c.format) !== w.minutes;
}
export function differs(c, w) { return textDiffers(c, w) || lengthDiffers(c, w); }

/* Rewrite one class's four text fields inside the classes.js source.

   Works line by line inside that class only (from its slug line to the next
   slug line). desc / walkout / prereq are one line each; covers runs from
   `covers: [` to its closing `],`. Strings are written with JSON.stringify,
   which is always a valid JavaScript string. Everything else in the file is
   left byte-for-byte alone. */
export function applyEdit(src, slug, w) {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => new RegExp(`slug:\\s*"${slug}"`).test(l));
  if (start < 0) throw new Error(`slug ${slug} not found in classes.js`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/slug:\s*"/.test(lines[i])) { end = i; break; }
  }
  const block = lines.slice(start, end);
  const indent = (block[0].match(/^(\s*)/) || ["", "    "])[1];
  const S = (v) => JSON.stringify(v);

  const find = (re) => block.findIndex((l) => re.test(l));

  // length (only when the edit carries one)
  if (w.minutes !== null && w.minutes !== undefined) {
    const fi = find(/^\s*format\s*:/);
    const cur = fi >= 0 ? (block[fi].match(/format\s*:\s*("(?:[^"\\]|\\.)*")/) || [])[1] : null;
    const line = `${indent}format: ${S(withMinutes(cur ? JSON.parse(cur) : "", w.minutes))},`;
    if (fi >= 0) block[fi] = line;
    else block.splice(find(/^\s*desc\s*:/) + 1, 0, line);
  }

  // desc
  const di = find(/^\s*desc\s*:/);
  if (di < 0) throw new Error(`${slug}: no desc line`);
  block[di] = `${indent}desc: ${S(w.desc)},`;

  // covers
  const ci = find(/^\s*covers\s*:\s*\[/);
  const coverLines = [`${indent}covers: [`, ...w.covers.map((c, i) => `${indent}  ${S(c)}${i < w.covers.length - 1 ? "," : ""}`), `${indent}],`];
  if (ci >= 0) {
    let ce = ci;
    if (!/\]\s*,?\s*$/.test(block[ci])) {
      for (let i = ci + 1; i < block.length; i++) { if (/^\s*\]\s*,?\s*$/.test(block[i])) { ce = i; break; } }
      if (ce === ci) throw new Error(`${slug}: covers list has no end`);
    }
    block.splice(ci, ce - ci + 1, ...coverLines);
  } else {
    const fi = find(/^\s*format\s*:/);
    block.splice((fi >= 0 ? fi : find(/^\s*desc\s*:/)) + 1, 0, ...coverLines);
  }

  // walkout
  const wi = find(/^\s*walkout\s*:/);
  if (w.walkout) {
    const line = `${indent}walkout: ${S(w.walkout)},`;
    if (wi >= 0) block[wi] = line;
    else block.splice(find(/^\s*\],\s*$/) + 1, 0, line);
  } else if (wi >= 0) block.splice(wi, 1);

  // prereq
  const pi = find(/^\s*prereq\s*:/);
  if (w.prereq) {
    const line = `${indent}prereq: ${S(w.prereq)},`;
    if (pi >= 0) block[pi] = line;
    else {
      const after = Math.max(find(/^\s*walkout\s*:/), find(/^\s*\],\s*$/));
      block.splice(after + 1, 0, line);
    }
  } else if (pi >= 0) block.splice(pi, 1);

  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join("\n");
}

export function emailHtml(changes) {
  const e = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return changes.map(({ name, by, w, lengthWaiting, resyncNeeded }) => `
  <h2 style="font-family:Georgia,serif;color:#2E4A3C;margin:24px 0 4px">${e(name)}</h2>
  <p style="color:#5A5E55;margin:0 0 12px">Changed by ${e(by || "someone in the portal")}. It's live on the class page now.</p>
  ${w.minutes ? `<p style="margin:0 0 10px"><strong>Length: ${w.minutes} minutes.</strong> Changed in Cal.com too.</p>` : ""}
  <p style="margin:0 0 10px">${e(w.desc)}</p>
  <p style="margin:12px 0 4px;font-weight:600">What we'll cover</p>
  <ul style="margin:0 0 10px">${w.covers.map((c) => `<li>${e(c)}</li>`).join("")}</ul>
  ${w.walkout ? `<p style="margin:12px 0 4px;font-weight:600">What you'll walk out with</p><p style="margin:0">${e(w.walkout)}</p>` : ""}
  ${w.prereq ? `<p style="margin:12px 0 4px;font-weight:600">Know before you go</p><p style="margin:0">${e(w.prereq)}</p>` : ""}
  ${lengthWaiting ? `<p style="margin:12px 0 0;color:#9C3B2E"><strong>Not done yet:</strong> the length change to ${lengthWaiting} minutes couldn't be made in Cal.com, so the booking calendar still has the old length. Ask Claude to finish it.</p>` : ""}
  ${resyncNeeded ? `<p style="margin:12px 0 0;color:#9C3B2E"><strong>Not done yet:</strong> her dates need re-saving so Cal.com's booking windows fit the new length. Ask Claude.</p>` : ""}`).join("\n")
  + `<p style="color:#8A8E83;font-size:13px;margin-top:28px">If something here shouldn't be public, change it back in the portal (Edit my class) - you can edit any class.</p>`;
}

/* ------------------------------------------------------------ class length -- */

/* A class's length lives in Cal.com as well as on the page: the event's
   lengthInMinutes decides the slot, and the schedule-sync Worker sizes each
   date's booking window from it. So a length change goes to Cal.com first -
   the class's own event, its "-redeem" (and any other suffixed) twin, and a
   "-fff" bundle twin that starts with this class (same schedule) - and only
   then onto the page. Never touches the schedule every dateless class shares. */
const SHARED_EMPTY_SCHEDULE_ID = "2187337";
export function lengthTargets(events, slug) {
  const main = events.find((e) => e.slug === slug);
  if (!main) return [];
  return events.filter((e) => e.slug === slug || e.slug.startsWith(slug + "-")
    || (/-fff$/.test(e.slug) && main.scheduleId && e.scheduleId === main.scheduleId
        && String(main.scheduleId) !== SHARED_EMPTY_SCHEDULE_ID));
}

async function setCalLength({ fetchImpl, key, slug, minutes, log }) {
  const H = { Authorization: `Bearer ${key}`, "cal-api-version": "2024-06-14", "Content-Type": "application/json" };
  const list = await fetchImpl("https://api.cal.com/v2/event-types", { headers: H });
  if (!list.ok) throw new Error(`Cal.com event list: ${list.status}`);
  const events = (await list.json()).data || [];
  const targets = lengthTargets(events, slug);
  if (!targets.length) throw new Error(`no Cal.com event called ${slug}`);
  for (const e of targets) {
    if (e.lengthInMinutes === minutes) continue;
    const r = await fetchImpl(`https://api.cal.com/v2/event-types/${e.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ lengthInMinutes: minutes }) });
    if (!r.ok) throw new Error(`Cal.com refused ${e.slug}: ${r.status} ${await r.text()}`);
    log(`  Cal.com ${e.slug}: ${e.lengthInMinutes} -> ${minutes} minutes`);
  }
  return targets.map((e) => e.slug);
}

/* Re-save each of the class's dates unchanged. The class_sessions webhook then
   runs the schedule-sync Worker, which rebuilds the booking windows at the new
   length - without it a longer class no longer fits its window and the date
   stops being bookable. */
async function resyncDates({ fetchImpl, key, slug, log }) {
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const r = await fetchImpl(`${SUPABASE_URL}/rest/v1/class_sessions?class_slug=eq.${slug}&or=(status.is.null,status.neq.canceled)&select=id,class_name`, { headers: H });
  if (!r.ok) throw new Error(`class_sessions: ${r.status}`);
  const rows = await r.json();
  for (const s of rows) {
    const u = await fetchImpl(`${SUPABASE_URL}/rest/v1/class_sessions?id=eq.${s.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ class_name: s.class_name }) });
    if (!u.ok) throw new Error(`re-sync ${s.id}: ${u.status}`);
  }
  log(`  re-synced ${rows.length} date(s) for ${slug}`);
  return rows.length;
}

/* ------------------------------------------------------------ the run ------ */

export async function run({ root, fetchImpl = fetch, dryRun = false, log = console.log, env = process.env } = {}) {
  const r = await fetchImpl(`${SUPABASE_URL}/rest/v1/class_edits?select=slug,description,covers,walkout,prereq,minutes,edited_by_name,updated_at&order=slug`, {
    headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}` },
  });
  if (!r.ok) throw new Error(`could not read class_edits: ${r.status} ${await r.text()}`);
  const rows = await r.json();

  const path = join(root, "classes.js");
  const src = readFileSync(path, "utf-8");
  const classes = loadClasses(src);
  const bySlug = Object.fromEntries(classes.map((c) => [c.slug, c]));

  let next = src;
  const changes = [];
  for (const row of rows) {
    const c = bySlug[row.slug];
    if (!c) { log(`${row.slug}: not in classes.js - skipped`); continue; }
    const w = wanted(row);
    if (!w.desc || !w.covers.length) { log(`${row.slug}: empty edit - skipped`); continue; }
    if (!differs(c, w)) continue;
    const ch = { slug: row.slug, name: c.name, by: row.edited_by_name, w, from: minutesOf(c.format) };
    log(`UPDATE ${row.slug} (${row.edited_by_name || "?"})`);
    if (lengthDiffers(c, w)) {
      if (dryRun) log(`  length ${ch.from} -> ${w.minutes} minutes (Cal.com too)`);
      else if (!env.CAL_API_KEY) {
        log(`  length ${ch.from} -> ${w.minutes} WAITING: no CAL_API_KEY, so Cal.com can't be changed - text only`);
        ch.lengthWaiting = w.minutes; ch.w = w = { ...w, minutes: null };
      } else {
        try {
          ch.calEvents = await setCalLength({ fetchImpl, key: env.CAL_API_KEY, slug: row.slug, minutes: w.minutes, log });
          if (env.SUPABASE_SERVICE_ROLE_KEY) ch.resynced = await resyncDates({ fetchImpl, key: env.SUPABASE_SERVICE_ROLE_KEY, slug: row.slug, log });
          else { ch.resyncNeeded = true; log("  no SUPABASE_SERVICE_ROLE_KEY - her dates need re-saving so Cal.com fits the new length"); }
        } catch (e) {
          log(`  length NOT changed: ${e.message}`);
          ch.lengthWaiting = w.minutes; ch.w = w = { ...w, minutes: null };
        }
      }
    }
    if (!differs(c, w)) { if (ch.lengthWaiting) changes.push(ch); continue; }
    next = applyEdit(next, row.slug, w);
    changes.push(ch);
  }
  if (!changes.length) { log("Every edited class already matches the site."); return { changes }; }
  if (next === src) { log("Nothing to write to the site."); return { changes, wrote: false }; }

  // The rewrite must read back exactly as the edit, or nothing is written.
  const check = Object.fromEntries(loadClasses(next).map((c) => [c.slug, c]));
  for (const ch of changes) {
    if (differs(check[ch.slug], ch.w)) throw new Error(`${ch.slug}: rewrite did not read back as the edit - nothing written`);
  }
  if (dryRun) { log("(dry run - nothing written)"); return { changes }; }

  writeFileSync(path, next);
  execFileSync(process.execPath, ["--check", path]);

  const files = walk(root, new Set([".git", "node_modules", "docs", "supabase", ".claude", ".github", "minor", "start.html"]));
  let bumped = 0;
  for (const f of files) {
    const t = bumpText(readFileSync(f, "utf-8"));
    if (t !== null) { writeFileSync(f, t); bumped++; }
  }
  log(`classes.js cache version bumped in ${bumped} files`);
  execFileSync(process.execPath, [join(root, "tools", "build-class-pages.mjs")], { stdio: "ignore" });
  log("class pages rebuilt");
  return { changes, wrote: true };
}

export async function notify(changes, { fetchImpl = fetch, key = process.env.RESEND_API_KEY, log = console.log } = {}) {
  if (!changes.length) return;
  if (!key) { log("(no RESEND_API_KEY - no email)"); return; }
  const subject = `Class page updated: ${changes.map((c) => c.name).join(", ")}`;
  const r = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SEND_FROM, to: [NOTIFY_TO], subject, html: emailHtml(changes) }),
  });
  if (!r.ok) throw new Error(`Resend refused the email: ${r.status} ${await r.text()}`);
  log(`Emailed Erika: ${subject}`);
}

/* ------------------------------------------------------------ entry -------- */

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const notesFile = join(root, ".class-edits-published.json");   // between the run and the email; not committed
  if (process.argv.includes("--notify")) {
    let changes = [];
    try { changes = JSON.parse(readFileSync(notesFile, "utf-8")); } catch { /* nothing published */ }
    notify(changes).catch((e) => { console.error(e.message || e); process.exit(1); });
  } else {
    const dryRun = process.argv.includes("--dry-run");
    run({ root, dryRun })
      .then(({ changes, wrote }) => {
        /* Only a run that changed the site commits and emails. A length that
           is still waiting on Cal.com is retried every run; emailing each
           time would be every 10 minutes. */
        if (dryRun || !wrote) return;
        writeFileSync(notesFile, JSON.stringify(changes));
        if (process.env.GITHUB_OUTPUT) {
          writeFileSync(process.env.GITHUB_OUTPUT, `summary=${changes.map((c) => c.name).join(", ")}\n`, { flag: "a" });
        }
      })
      .catch((e) => { console.error(e.message || e); process.exit(1); });
  }
}
