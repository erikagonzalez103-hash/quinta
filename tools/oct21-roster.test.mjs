// node tools/oct21-roster.test.mjs
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRoster, phaseFor, run } from "./oct21-roster.mjs";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗"} ${name}`); };

const session = { id: "s1", class_name: "Module 1", start_time: "10:00:00",
                  instructor_email: "teacher@example.com", instructor_name: "Pat Teacher" };
const students = [
  { session_id: "s1", student_name: "Zoe Room", student_email: "zoe@example.com", attending: "in-person" },
  { session_id: "s1", student_name: "Ann Online", student_email: "ann@example.com", attending: "online" },
];

console.log("phase");
check("the 20th is the first list", phaseFor(new Date("2026-10-20T14:00:00Z")) === "first");
check("just after midnight on the 21st is the final list", phaseFor(new Date("2026-10-21T05:41:00Z")) === "final");
check("late on the 20th in Dallas is still the first list", phaseFor(new Date("2026-10-21T04:30:00Z")) === "first");
check("any other day does nothing", phaseFor(new Date("2027-10-20T14:00:00Z")) === null);

console.log("the email");
const m = buildRoster(session, students, "first");
check("goes to the teacher", m.to === "teacher@example.com");
check("counts students and online", m.subject.includes("2 students, 1 online"));
check("online email is in the paste line", m.text.includes("SEND YOUR VIDEO LINK TO: ann@example.com"));
check("in-person student is not in the paste line", !/LINK TO:.*zoe/.test(m.text));
check("first list says booking is still open", m.text.includes("until midnight"));
check("final list says it is complete", buildRoster(session, students, "final").subject.startsWith("Final list"));
check("an empty class still gets a note", buildRoster(session, [], "first").text.includes("Nobody has booked"));
check("a session with no teacher goes to Erika", buildRoster({ ...session, instructor_email: null }, [], "first").to === "erika@quintaand.co");
check("names are escaped", buildRoster(session, [{ ...students[0], student_name: "<b>x</b>" }], "first").html.includes("&lt;b&gt;"));

console.log("sending once");
const dir = mkdtempSync(join(tmpdir(), "roster-"));
const sent = [];
const fakeFetch = async (url, opts) => {
  if (url.includes("resend")) { sent.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({}) }; }
  if (url.includes("class_sessions")) return { ok: true, json: async () => [session] };
  return { ok: true, json: async () => students };
};
const env = { SUPABASE_SERVICE_ROLE_KEY: "k", RESEND_API_KEY: "r" };
const quiet = () => {};
await run({ fetch: fakeFetch, env, phase: "first", markerDir: dir, log: quiet });
check("sends one email per class, Erika copied", sent.length === 1 && sent[0].cc[0] === "erika@quintaand.co");
check("leaves a marker", existsSync(join(dir, "oct21-roster-first.sent")));
await run({ fetch: fakeFetch, env, phase: "first", markerDir: dir, log: quiet });
check("a second run sends nothing", sent.length === 1);
await run({ fetch: fakeFetch, env, now: new Date("2026-10-25T14:00:00Z"), markerDir: dir, log: quiet });
check("a run on another day sends nothing", sent.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
