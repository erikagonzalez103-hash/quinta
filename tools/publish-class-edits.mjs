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
 * them, not painted in by a script. Runs every 10 minutes from
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
  };
}

export function differs(c, w) {
  return (c.desc || "") !== w.desc
    || JSON.stringify(c.covers || []) !== JSON.stringify(w.covers)
    || (c.walkout || "") !== w.walkout
    || (c.prereq || "") !== w.prereq;
}

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
  return changes.map(({ name, by, w }) => `
  <h2 style="font-family:Georgia,serif;color:#2E4A3C;margin:24px 0 4px">${e(name)}</h2>
  <p style="color:#5A5E55;margin:0 0 12px">Changed by ${e(by || "someone in the portal")}. It's live on the class page now.</p>
  <p style="margin:0 0 10px">${e(w.desc)}</p>
  <p style="margin:12px 0 4px;font-weight:600">What we'll cover</p>
  <ul style="margin:0 0 10px">${w.covers.map((c) => `<li>${e(c)}</li>`).join("")}</ul>
  ${w.walkout ? `<p style="margin:12px 0 4px;font-weight:600">What you'll walk out with</p><p style="margin:0">${e(w.walkout)}</p>` : ""}
  ${w.prereq ? `<p style="margin:12px 0 4px;font-weight:600">Know before you go</p><p style="margin:0">${e(w.prereq)}</p>` : ""}`).join("\n")
  + `<p style="color:#8A8E83;font-size:13px;margin-top:28px">If something here shouldn't be public, change it back in the portal (Edit my class) - you can edit any class.</p>`;
}

/* ------------------------------------------------------------ the run ------ */

export async function run({ root, fetchImpl = fetch, dryRun = false, log = console.log } = {}) {
  const r = await fetchImpl(`${SUPABASE_URL}/rest/v1/class_edits?select=slug,description,covers,walkout,prereq,edited_by_name,updated_at&order=slug`, {
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
    next = applyEdit(next, row.slug, w);
    changes.push({ slug: row.slug, name: c.name, by: row.edited_by_name, w });
    log(`UPDATE ${row.slug} (${row.edited_by_name || "?"})`);
  }
  if (!changes.length) { log("Every edited class already matches the site."); return { changes }; }

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
  return { changes };
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
      .then(({ changes }) => {
        if (dryRun || !changes.length) return;
        writeFileSync(notesFile, JSON.stringify(changes));
        if (process.env.GITHUB_OUTPUT) {
          writeFileSync(process.env.GITHUB_OUTPUT, `summary=${changes.map((c) => c.name).join(", ")}\n`, { flag: "a" });
        }
      })
      .catch((e) => { console.error(e.message || e); process.exit(1); });
  }
}
