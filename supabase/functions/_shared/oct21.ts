// Shared by stripe-checkout, stripe-webhook and oct21-redeem.
//
// 21 October is booked on quintaand.co/oct21.html, not in Cal.com: one Cal.com
// account is "busy" across all its events once any is booked, so classes that
// run side by side would hide each other. Without Cal.com there is no Cal.com
// confirmation and no Cal.com webhook - so these send the student her
// confirmation and tell her teacher, which Cal.com and cal-instructor-notify
// do for every other date.

export const OCT21 = "2026-10-21";
export const SEATS = 10;                       // per class, room and online together

/* Sales stop at midnight going into the day (Dallas is on CDT, UTC-5, in
   October). Erika's call on 6 Oct: nothing sells on the 21st itself, so
   every teacher has her full list - online students included - the night
   before. Checked by stripe-checkout and oct21-redeem; oct21.html shows the
   closed note from the same moment. */
export const SALES_CLOSE = Date.parse("2026-10-21T00:00:00-05:00");
export const salesClosed = () => Date.now() >= SALES_CLOSE;
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";
const ERIKA = "erika@quintaand.co";
const WHERE = "kiln coworking, Preston Hollow, Dallas";

export type Session = {
  session_id: string; class_slug: string; class_name: string;
  start_time: string; daypart: string | null; format: string | null;
  teacher: string | null; seats_left: number;
};

/* The day's classes with seats left, as the public page sees them. */
export async function sessions(url: string, key: string): Promise<Session[]> {
  const r = await fetch(`${url}/rest/v1/rpc/oct21_sessions`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error(`oct21_sessions ${r.status} ${await r.text()}`);
  return await r.json();
}

/* The teacher on a session - not exposed to the public page. */
export async function teacherOf(url: string, key: string, sessionId: string) {
  const r = await fetch(
    `${url}/rest/v1/class_sessions?id=eq.${encodeURIComponent(sessionId)}&select=instructor_email,instructor_name,class_name,start_time`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export function clock(t: string): string {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

async function send(resendKey: string, msg: Record<string, unknown>): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SEND_FROM, ...msg }),
  });
  if (!r.ok) console.error("Resend failed", msg.to, r.status, await r.text());
  return r.ok;
}

const wrap = (inner: string) =>
  `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:520px">${inner}` +
  `<p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Quinta &amp; Co. · Dallas, Texas</p></div>`;

/* `online` is per seat, not per order. A teacher can run her session online
   only - on 6 Oct, Brand 101 was - and a buyer who picked "in person" for
   the day is still online for that one class. */
export type Seat = { class_name: string; start_time: string; session_id: string; online?: boolean };

/* How she is joining one particular session: online if the session only runs
   online, otherwise whatever she chose. */
export function attendingFor(sessionFormat: string | null | undefined, chosen: string): string {
  return sessionFormat === "online" ? "online" : (chosen === "online" ? "online" : "in-person");
}

/* Her confirmation. One email for everything she booked on the day. */
export async function confirmStudent(resendKey: string, to: string, name: string,
                                     seats: Seat[], attending: string): Promise<boolean> {
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  const isOnline = (s: Seat) => s.online === true || (s.online === undefined && attending === "online");
  const sorted = seats.slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
  const anyOnline = sorted.some(isOnline);
  const anyRoom = sorted.some((s) => !isOnline(s));
  const tag = (s: Seat) => (anyOnline && anyRoom ? (isOnline(s) ? " (online)" : " (in person)") : "");
  const list = sorted
    .map((s) => `<li style="margin:0 0 8px"><strong>${esc(clock(s.start_time))}</strong> — ${esc(s.class_name)}${esc(tag(s))}</li>`)
    .join("");
  const listText = sorted.map((s) => `- ${clock(s.start_time)}  ${s.class_name}${tag(s)}`).join("\n");
  const how = anyOnline && anyRoom
    ? `The in-person classes are at ${WHERE}. For the online ones, your teacher emails you the video link before class — keep an eye out the day before.`
    : anyOnline
    ? "You're joining online. Your teacher emails you the video link before class — keep an eye out the day before."
    : `You're joining in person at ${WHERE}.`;
  const html = wrap(`
    <p style="margin:0 0 16px">Hi ${esc(first)},</p>
    <p style="margin:0 0 16px">You're booked for <strong>Wednesday, October 21</strong>:</p>
    <ul style="margin:0 0 18px;padding-left:20px">${list}</ul>
    <p style="margin:0 0 16px">${esc(how)}</p>
    <p style="margin:0 0 16px;font-size:14px;color:#5A5E55">On the day there's a QR code on the first
      slide of each class. Scan it and type your name — that's how we know you were there. Can't come
      after all? Reply to this email at least 24 hours ahead and the class stays yours to take another
      time.</p>`);
  const text = `Hi ${first},\n\nYou're booked for Wednesday, October 21:\n\n${listText}\n\n${how}\n\n`
    + `On the day, scan the QR code on the first slide of each class and type your name.\n`
    + `Can't come after all? Reply at least 24 hours ahead and the class stays yours.\n\nQuinta & Co.\n`;
  return await send(resendKey, {
    to: [to], bcc: [ERIKA], reply_to: ERIKA,
    subject: seats.length === 1
      ? `You're booked: ${seats[0].class_name}, October 21`
      : `You're booked for ${seats.length} classes on October 21`,
    html, text,
  });
}

/* Her teacher, once per class. Online first and loudest, because an online
   student needs a link from the teacher and nobody else will send one. */
export async function tellTeacher(resendKey: string, url: string, key: string, seat: Seat,
                                  student: { name: string; email: string }, attending: string,
                                  paid: boolean): Promise<boolean> {
  const t = await teacherOf(url, key, seat.session_id);
  const to = t?.instructor_email || ERIKA;
  const teacher = String(t?.instructor_name || "").split(/\s+/)[0] || "there";
  const online = attending === "online";
  const join = online
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#EEF2EC;border-left:3px solid #4F6B5C">
         <strong>She's joining online.</strong> Reply to this email with your video link — the reply
         goes straight to her.</p>`
    : `<p style="margin:0 0 16px"><strong>Joining:</strong> in person at kiln</p>`;
  const html = wrap(`
    <p style="margin:0 0 16px">Hi ${esc(teacher)},</p>
    <p style="margin:0 0 16px"><strong>${esc(student.name || student.email)}</strong> just booked
      <strong>${esc(seat.class_name)}</strong> at ${esc(clock(seat.start_time))} on October 21.</p>
    ${join}
    <p style="margin:0 0 16px"><strong>Her email:</strong> ${esc(student.email)}</p>
    ${paid ? "" : `<p style="margin:0 0 14px;color:#5A5E55;font-size:14px">She used a class she'd already paid for, from a bundle or a gift.</p>`}
    <p style="margin:0 0 16px;font-size:14px;color:#5A5E55">Booked on the October 21 page rather than
      Cal.com, so it won't appear in Cal.com — this email is the record. Your sign-in code and title
      slide for the day are in your portal.</p>`);
  const text = `Hi ${teacher},\n\n${student.name || student.email} just booked ${seat.class_name} at `
    + `${clock(seat.start_time)} on October 21.\n\n`
    + (online ? "SHE'S JOINING ONLINE - reply to this email with your video link.\n\n" : "Joining: in person at kiln\n\n")
    + `Her email: ${student.email}\n`;
  return await send(resendKey, {
    to: [to], cc: to === ERIKA ? undefined : [ERIKA], reply_to: student.email,
    subject: `October 21 booking${online ? " (online)" : ""} — ${seat.class_name}, ${clock(seat.start_time)}`,
    html, text,
  });
}
