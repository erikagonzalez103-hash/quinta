// node tools/publish-class-edits.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadClasses, wanted, differs, lengthDiffers, minutesOf, withMinutes, lengthTargets, applyEdit, emailHtml, run } from "./publish-class-edits.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "classes.js"), "utf-8");
const before = Object.fromEntries(loadClasses(src).map((c) => [c.slug, c]));
const after = (s) => Object.fromEntries(loadClasses(s).map((c) => [c.slug, c]));

// 1. A full edit reads back exactly, with awkward characters.
const w1 = wanted({
  description: '  Protect the name you built — "search first", then file. It\'s 100% plain English.  ',
  covers: ["What a trademark protects", "", "  Searching the USPTO \\ TESS properly  ", "Filing: DIY vs. attorney"],
  walkout: "A search-and-file plan for your name.",
  prereq: "Bring your business name (and any logo).",
});
assert.equal(w1.covers.length, 3, "blank bullets dropped, others trimmed");
const s1 = applyEdit(src, "trademarks", w1);
const t1 = after(s1).trademarks;
assert.equal(differs(t1, w1), false, "trademarks reads back as the edit");
assert.equal(t1.name, before.trademarks.name, "name untouched");
assert.equal(t1.price, before.trademarks.price, "price untouched");
assert.equal(t1.booking, before.trademarks.booking, "booking untouched");
assert.equal(t1.disclaimer, before.trademarks.disclaimer, "disclaimer untouched");

// 2. Nothing outside the class moved.
for (const slug of Object.keys(before)) {
  if (slug === "trademarks") continue;
  assert.deepEqual(after(s1)[slug], before[slug], `${slug} unchanged`);
}

// 3. Clearing prereq / walkout removes the lines; the class still loads.
const s2 = applyEdit(s1, "trademarks", { ...w1, prereq: "", walkout: "" });
const t2 = after(s2).trademarks;
assert.equal(t2.prereq, undefined);
assert.equal(t2.walkout, undefined);
assert.equal(differs(t2, { ...w1, prereq: "", walkout: "" }), false);

// 4. Adding prereq where there was none (financial-planning has none today).
assert.equal(before["financial-planning"].prereq, undefined);
const w4 = { ...wanted({ description: before["financial-planning"].desc, covers: before["financial-planning"].covers, walkout: before["financial-planning"].walkout }), prereq: "Bring your last two bank statements." };
const t4 = after(applyEdit(src, "financial-planning", w4))["financial-planning"];
assert.equal(differs(t4, w4), false, "prereq inserted");

// 5. A class whose text already matches is not a change.
const same = wanted({ description: before.trademarks.desc, covers: before.trademarks.covers, walkout: before.trademarks.walkout, prereq: before.trademarks.prereq });
assert.equal(differs(before.trademarks, same), false);

// 6. Unknown slug is refused rather than guessed.
assert.throws(() => applyEdit(src, "no-such-class", w1));

// 7. The email escapes HTML.
assert.ok(!emailHtml([{ name: "T", by: "<b>", w: { ...w1, desc: "<script>" } }]).includes("<script>"));

// 8. run(), dry: reads rows, skips unknown and empty ones, never writes.
const rows = [
  { slug: "trademarks", description: w1.desc, covers: w1.covers, walkout: w1.walkout, prereq: w1.prereq, edited_by_name: "Nik" },
  { slug: "legacy-planning", description: "x".repeat(30), covers: ["a"], edited_by_name: "Nik" },
  { slug: "brand-101", description: before["brand-101"].desc, covers: before["brand-101"].covers, walkout: before["brand-101"].walkout, prereq: before["brand-101"].prereq },
];
const fake = async () => ({ ok: true, json: async () => rows });
const res = await run({ root, fetchImpl: fake, dryRun: true, log: () => {} });
assert.deepEqual(res.changes.map((c) => c.slug), ["trademarks"]);
assert.equal(readFileSync(join(root, "classes.js"), "utf-8"), src, "dry run wrote nothing");

// 9. Length: read, rewrite, and only when asked.
assert.equal(minutesOf("90 minutes · live, small group"), 90);
assert.equal(minutesOf("Live, small group"), null);
assert.equal(withMinutes("90 minutes · live, small group", 120), "120 minutes · live, small group");
// Uses whatever length Trademarks has today (it went 90 -> 120 on 7 Oct and
// broke a check that assumed 90), and a different one for the change.
const cur9 = minutesOf(before.trademarks.format), other9 = cur9 === 120 ? 90 : 120;
const s9 = applyEdit(src, "trademarks", { ...w1, minutes: other9 });
const t9 = after(s9).trademarks;
assert.equal(t9.format, `${other9} minutes · live, small group`);
assert.equal(differs(t9, { ...w1, minutes: other9 }), false);
assert.equal(after(applyEdit(src, "trademarks", { ...w1, minutes: null })).trademarks.format, before.trademarks.format, "no minutes = length untouched");
assert.equal(lengthDiffers(before.trademarks, { ...w1, minutes: null }), false);
assert.equal(lengthDiffers(before.trademarks, { ...w1, minutes: cur9 }), false, "same length is not a change");
assert.equal(lengthDiffers(before.trademarks, { ...w1, minutes: other9 }), true, "a different length is a change");

// 10. Which Cal.com events a length change touches.
const ev = [
  { id: 1, slug: "trademarks", scheduleId: 10 }, { id: 2, slug: "trademarks-redeem", scheduleId: 10 },
  { id: 3, slug: "trademarks-fall25", scheduleId: 10 }, { id: 4, slug: "build-to-last-fff", scheduleId: 20 },
  { id: 5, slug: "certification", scheduleId: 20 }, { id: 6, slug: "funding", scheduleId: 2187337 },
  { id: 7, slug: "insurance", scheduleId: 2187337 }, { id: 8, slug: "get-started-fff", scheduleId: 2187337 },
];
assert.deepEqual(lengthTargets(ev, "trademarks").map((e) => e.id), [1, 2, 3]);
assert.deepEqual(lengthTargets(ev, "certification").map((e) => e.id), [4, 5], "bundle twin on the same schedule");
assert.deepEqual(lengthTargets(ev, "funding").map((e) => e.id), [6], "never the shared empty schedule's others");
assert.deepEqual(lengthTargets(ev, "nope"), []);

// 11. A length change with no Cal.com key publishes the words but not the length.
const rows11 = [{ slug: "trademarks", description: w1.desc, covers: w1.covers, walkout: w1.walkout, prereq: w1.prereq, minutes: other9 }];
const res11 = await run({ root, fetchImpl: async () => ({ ok: true, json: async () => rows11 }), dryRun: true, log: () => {}, env: {} });
assert.equal(res11.changes.length, 1);

console.log("all checks passed");
