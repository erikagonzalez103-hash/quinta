/*
 * Quinta & Co. — class date sync
 *
 * WHAT IT DOES
 * Asks Cal.com which classes have a bookable date, and makes the site agree:
 * a class with dates is bookable everywhere, a class without them shows the
 * waitlist everywhere. Then rebuilds the class pages and bumps the cache
 * version so browsers pick the change up. Runs every 30 minutes from
 * .github/workflows/sync-class-dates.yml, which commits whatever changed.
 *
 * WHY IT EXISTS
 * "Bookable" lived in hand-set flags in classes.js. Faculty add dates in the
 * portal, the dates reach Cal.com in a minute or two - and the site went on
 * saying "join the waitlist" until someone remembered to flip a flag. On
 * 30 Sep four classes were still showing "See dates & book" over an empty
 * calendar because their September dates had passed and nobody had noticed.
 * Cal.com is the truth about what can be booked; this makes the site follow it.
 *
 * WHAT IT WILL NOT DO
 * - Touch a class whose Cal.com lookup failed. Unknown is not the same as
 *   undated; that class keeps whatever it had until a run can see it.
 * - Close every open class at once. If Cal.com says nothing has dates while
 *   the site has bookable classes, that is far likelier to be Cal.com having a
 *   bad minute than every teacher cancelling together. It stops and fails the
 *   run, and GitHub emails about the failure.
 * - Rewrite a class whose state is already right. Hand-written notes on those
 *   lines survive until the state actually changes.
 *
 * HOW A CLASS IS MARKED
 * The script owns the open/soon lines of every class it syncs, and writes one
 * of exactly two lines after the class's slug:
 *     open: true,               // AUTO: ...
 *     open: false, soon: true,  // AUTO: ...
 * `open: true` wins over `soon` everywhere (app.js, the page builder, the
 * landing page). `soon: true` is needed on the closed line because an AI
 * module with neither flag counts as bookable.
 *
 * NEEDS NO SECRETS. Cal.com's availability endpoint is public, the same one
 * the booking page itself calls.
 *
 * RUN BY HAND
 *   node tools/sync-class-dates.mjs --dry-run    see what it would change
 *   node tools/sync-class-dates.mjs              change it (then commit)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const CAL_USER = "quintaandco";
const WINDOW_DAYS = 150;
const AUTO = "// AUTO: set from Cal.com by tools/sync-class-dates.mjs — edit dates in the portal, not here";

/* ------------------------------------------------------------ pure parts -- */

/* Which classes this script is in charge of: every paid class whose booking
   link is a Quinta Cal.com event. Coffee is free and run by hand.

   A class marked `hold: true` is never touched, whatever Cal.com says. That
   is for a class with no instructor: on 2 Oct Entity setup still had an old
   Oct 27 date sitting in its Cal.com schedule, and without a hold this
   would have opened a class nobody was teaching. */
export function syncable(classes) {
  const re = new RegExp(`cal\\.com/${CAL_USER}/([a-z0-9-]+)`, "i");
  return classes
    .filter((c) => c && c.slug && !c.free && !c.hold && typeof c.booking === "string" && re.test(c.booking))
    .map((c) => ({ slug: c.slug, event: c.booking.match(re)[1], c }));
}

/* Same rule as app.js isSoon() and the page builder. */
export function isBookable(c, foundationsOpen) {
  if (c.open) return true;
  return !(!!c.soon || (c.track === "foundations" && !foundationsOpen));
}

/* What to change. `dated` maps slug -> true / false / null (null = lookup
   failed). Returns the list of { slug, to } that actually need flipping. */
export function decide(items, dated, foundationsOpen) {
  const out = [];
  for (const { slug, c } of items) {
    const want = dated[slug];
    if (want !== true && want !== false) continue;          // unknown: leave it
    if (isBookable(c, foundationsOpen) !== want) out.push({ slug, to: want });
  }
  return out;
}

/* The sanity stop described at the top. */
export function looksLikeAnOutage(items, dated, foundationsOpen) {
  const openNow = items.filter(({ c }) => isBookable(c, foundationsOpen)).length;
  const known = items.filter(({ slug }) => dated[slug] === true || dated[slug] === false);
  const anyDated = known.some(({ slug }) => dated[slug] === true);
  return openNow > 0 && known.length > 0 && !anyDated;
}

/* Rewrite one class's flags inside the classes.js source text.

   Finds the line holding `slug: "<slug>"`, then within that class (up to the
   next slug or the end) removes every open/soon line and any comment-only
   lines that continue it, and puts the single managed line straight after
   the slug line. Everything else in the file is left byte-for-byte alone. */
export function rewriteClass(src, slug, open) {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => new RegExp(`slug:\\s*"${slug}"`).test(l));
  if (start < 0) throw new Error(`slug ${slug} not found in classes.js`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/slug:\s*"/.test(lines[i])) { end = i; break; }
  }

  const keep = [];
  let dropping = false;
  for (let i = start + 1; i < end; i++) {
    const l = lines[i];
    if (/^\s*(open|soon)\s*:/.test(l)) { dropping = true; continue; }
    if (dropping && /^\s*\/\//.test(l)) continue;          // its continued comment
    dropping = false;
    keep.push(l);
  }

  const indent = (lines[start].match(/^(\s*)/) || ["", "    "])[1];
  const flag = open ? `${indent}open: true,               ${AUTO}`
                    : `${indent}open: false, soon: true,  ${AUTO}`;
  return [...lines.slice(0, start + 1), flag, ...keep, ...lines.slice(end)].join("\n");
}

/* classes.js?v=N -> N+1 in one file's text. Returns null when there is none. */
export function bumpText(text) {
  let changed = false;
  const out = text.replace(/classes\.js\?v=(\d+)/g, (_, n) => { changed = true; return `classes.js?v=${Number(n) + 1}`; });
  return changed ? out : null;
}

/* ------------------------------------------------------------ the run ------ */

async function lookup(fetchImpl, event, now) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const url = `https://api.cal.com/v2/slots?eventTypeSlug=${encodeURIComponent(event)}`
    + `&username=${CAL_USER}&start=${day(now)}&end=${day(now + WINDOW_DAYS * 86400000)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchImpl(url, { headers: { "cal-api-version": "2024-09-04" } });
      if (r.ok) {
        const d = await r.json();
        return Object.keys((d && d.data) || {}).length > 0;
      }
    } catch { /* try once more */ }
  }
  return null;
}

function walk(dir, skip, out = []) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, skip, out);
    else if (/\.(html|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

export async function run({ root, fetchImpl = fetch, now = Date.now(), dryRun = false, log = console.log } = {}) {
  globalThis.window = globalThis;
  const src = readFileSync(join(root, "classes.js"), "utf-8");
  const classes = new Function(src + "; return typeof QUINTA_CLASSES !== 'undefined' ? QUINTA_CLASSES : undefined;")();
  new Function(readFileSync(join(root, "config.js"), "utf-8"))();
  const foundationsOpen = !!(globalThis.QUINTA_CONFIG && globalThis.QUINTA_CONFIG.FOUNDATIONS_OPEN);

  const items = syncable(classes);
  const dated = {};
  await Promise.all(items.map(async ({ slug, event }) => { dated[slug] = await lookup(fetchImpl, event, now); }));

  const failed = items.filter(({ slug }) => dated[slug] === null).map((x) => x.slug);
  if (failed.length === items.length) {
    throw new Error("Cal.com did not answer for any class - nothing changed");
  }
  if (failed.length) log(`Could not check ${failed.join(", ")} - left as they are.`);

  if (looksLikeAnOutage(items, dated, foundationsOpen)) {
    throw new Error("Cal.com says no class has dates while the site has bookable ones - "
      + "refusing to close everything at once. Check Cal.com; nothing was changed.");
  }

  const changes = decide(items, dated, foundationsOpen);
  for (const ch of changes) log(`${ch.to ? "OPEN " : "CLOSE"}  ${ch.slug}`);
  if (!changes.length) { log("Every class already matches Cal.com."); return { changes }; }
  if (dryRun) { log("(dry run - nothing written)"); return { changes }; }

  let next = src;
  for (const ch of changes) next = rewriteClass(next, ch.slug, ch.to);
  writeFileSync(join(root, "classes.js"), next);

  // A bad rewrite must never reach the site.
  execFileSync(process.execPath, ["--check", join(root, "classes.js")]);

  const files = walk(root, new Set([".git", "node_modules", "docs", "supabase", ".claude", ".github"]));
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

/* ------------------------------------------------------------ entry -------- */

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dryRun = process.argv.includes("--dry-run");
  run({ root, dryRun })
    .then(({ changes }) => {
      // Tell the workflow what happened, for the commit message. Never on a
      // dry run: nothing was written, and the publish step would try to
      // commit nothing and fail the run.
      if (process.env.GITHUB_OUTPUT && changes.length && !dryRun) {
        const opened = changes.filter((c) => c.to).map((c) => c.slug);
        const closed = changes.filter((c) => !c.to).map((c) => c.slug);
        const msg = [opened.length ? `open ${opened.join(", ")}` : "", closed.length ? `waitlist ${closed.join(", ")}` : ""]
          .filter(Boolean).join("; ");
        writeFileSync(process.env.GITHUB_OUTPUT, `summary=${msg}\n`, { flag: "a" });
      }
    })
    .catch((e) => { console.error(e.message || e); process.exit(1); });
}
