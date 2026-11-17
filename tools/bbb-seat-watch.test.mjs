// node tools/bbb-seat-watch.test.mjs - the counting and "email or not" rules.
import assert from "node:assert/strict";
import { seatsFromSlots, assess, buildEmail, CLASSES } from "./bbb-seat-watch.mjs";

const day = (left, total = 20) => ({ status: "success", data: { "2026-12-15": [{ start: "x", seatsRemaining: left, seatsTotal: total }] } });
const none = { status: "success", data: {} };

assert.deepEqual(seatsFromSlots(day(20)), { booked: 0, total: 20, showing: true });
assert.deepEqual(seatsFromSlots(day(5)), { booked: 15, total: 20, showing: true });
assert.equal(seatsFromSlots(none).showing, false);

const all = (booked) => Object.fromEntries(CLASSES.flatMap((c) => c.links.map(([s]) => [s, seatsFromSlots(day(20 - (booked[s] || 0)))])));

// 17 across BK2's three links: no email
let rows = assess(all({ "bookkeeping-2-bbb": 10, "books-to-taxes-bbb": 4, "bookkeeping-2-bbb-redeem": 3 }), {});
assert.equal(rows.find((r) => r.key === "bk2").count, 17);
assert.ok(!rows.some((r) => r.alert));

// 18 -> email; same 18 next run -> no email; 19 -> email again
const at18 = all({ "bookkeeping-2-bbb": 11, "books-to-taxes-bbb": 4, "bookkeeping-2-bbb-redeem": 3 });
rows = assess(at18, {});
assert.ok(rows.find((r) => r.key === "bk2").alert);
assert.ok(!rows.find((r) => r.key === "bk1").alert);
assert.ok(!assess(at18, { bk2: 18 }).some((r) => r.alert));
assert.ok(assess(all({ "bookkeeping-2-bbb": 12, "books-to-taxes-bbb": 4, "bookkeeping-2-bbb-redeem": 3 }), { bk2: 18 }).find((r) => r.key === "bk2").alert);

// a link with no time showing counts as full (20) - never under-report
const fullOne = all({});
fullOne["year-end-tax-bbb"] = seatsFromSlots(none);
rows = assess(fullOne, {});
assert.equal(rows.find((r) => r.key === "tax").count, 20);
assert.ok(rows.find((r) => r.key === "tax").alert);
assert.match(buildEmail(rows).html, /no time showing/);
assert.match(buildEmail(rows).subject, /Year-End Tax Readiness has 20 people/);

console.log("seat watch: all checks pass");
