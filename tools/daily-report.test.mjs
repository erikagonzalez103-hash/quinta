import { run, startOfDallasDay, dallasDay, buildReport } from './daily-report.mjs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };

console.log('\n1. Dallas day boundaries (incl. the November DST change)');
{
  // 00:30 UTC on Aug 27 is still Aug 26 in Dallas — a signup at 7:30pm counts today
  const t = new Date('2026-08-27T00:30:00Z');
  check('late-evening Dallas time is still today', dallasDay(t) === '2026-08-26', dallasDay(t));
  check('day starts at Dallas midnight, not UTC', startOfDallasDay(t).toISOString() === '2026-08-26T05:00:00.000Z', startOfDallasDay(t).toISOString());
  // CST after the November change — offset must shift by an hour
  const w = new Date('2026-12-15T18:00:00Z');
  check('handles CST in December', startOfDallasDay(w).toISOString() === '2026-12-15T06:00:00.000Z', startOfDallasDay(w).toISOString());
}

const FACULTY = [
  { email: 'erika@quintaand.co', name: 'Erika Gonzalez Harrison' },
  { email: 'tara@quintaand.co', name: 'Tara Johnson' },
];
const NOW = new Date('2026-08-26T23:00:00Z');

console.log('\n2. A day where things happened');
{
  const r = buildReport({
    now: NOW, faculty: FACULTY,
    posts: { 'tara@quintaand.co': 3 },
    signups: [{ name: 'Robin Frazier', email: 'r@x.com', class_name: 'Bookkeeping II', ref: 'tara26' }],
    referrals: [{ ref: 'tara26', signups: 1 }, { ref: 'nery26', signups: 0 }],
    sessionsToday: [{ class_name: 'Brand 101', session_date: '2026-09-10', start_time: '18:00:00', instructor_name: 'Stephanie' }],
    unbookable: [{ class_name: 'Bookkeeping I', session_date: '2026-09-17', start_time: '17:30:00', note: 'a 2-hour class has to start on the hour' }],
  });
  check('subject carries the headline', /1 signup · 1\/2 posted · 1 unbookable/.test(r.subject), r.subject);
  check('names who posted', r.html.includes('Tara Johnson'));
  check('marks who did not', r.html.includes('nothing yet'));
  check('shows the signup and its credit', r.html.includes('Robin Frazier') && r.html.includes('via tara26'));
  check('shows zero-signup codes are hidden', !r.html.includes('nery26'));
  check('surfaces the unbookable date loudly', r.html.includes('NOT bookable') && r.html.includes('start on the hour'));
  check('escapes HTML in names', !buildReport({ now: NOW, faculty: [{ email: 'a@b.c', name: '<script>x</script>' }], posts: {}, signups: [], referrals: [], sessionsToday: [], unbookable: [] }).html.includes('<script>x'));
}

console.log('\n3. A completely quiet day still says something useful');
{
  const r = buildReport({ now: NOW, faculty: FACULTY, posts: {}, signups: [], referrals: [], sessionsToday: [], unbookable: [] });
  check('still sends', !!r.html);
  check('subject shows the zeros', /0 signups · 0\/2 posted/.test(r.subject), r.subject);
  check('says nobody posted', r.html.includes("Nobody marked a post done"));
  check('says no signups', r.html.includes('No signups today'));
  check('flags that no referral has ever converted', r.html.includes('actually carry ?ref='));
}

console.log('\n4. Missing tables do not kill the report');
{
  const fetchStub = async (url) => {
    if (url.includes('campaign_activity')) return { ok: false, status: 404, text: async () => 'no such table' };
    if (url.includes('referral_counts')) return { ok: false, status: 404, text: async () => 'no such table' };
    if (url.includes('faculty')) return { ok: true, json: async () => [{ email: 'tara@quintaand.co', display_name: 'Tara Johnson' }] };
    if (url.includes('waitlist')) return { ok: true, json: async () => [] };
    if (url.includes('class_sessions')) return { ok: true, json: async () => [] };
    throw new Error('unexpected ' + url);
  };
  const r = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW });
  check('produced a report anyway', !!r.html);
  check('faculty still listed', r.html.includes('Tara Johnson'));
}

console.log('\n5. Unbookable detection adapts to the column name');
{
  const sessions = [
    { class_name: 'X', session_date: '2026-09-30', start_time: '17:30:00', status: 'scheduled', bookable: false, bookable_note: 'blocked', created_at: '2026-08-01T00:00:00Z' },
    { class_name: 'Y', session_date: '2026-09-30', start_time: '18:00:00', status: 'scheduled', bookable: true, bookable_note: null, created_at: '2026-08-01T00:00:00Z' },
    { class_name: 'Z', session_date: '2026-01-01', start_time: '18:00:00', status: 'scheduled', bookable: false, bookable_note: 'old', created_at: '2026-08-01T00:00:00Z' },
  ];
  const fetchStub = async (url) => {
    if (url.includes('class_sessions')) return { ok: true, json: async () => sessions };
    if (url.includes('faculty')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [] };
  };
  const r = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW });
  check('finds the alternate column name', r.html.includes('NOT bookable'));
  check('reports the future failure', r.html.includes('X —'));
  check('ignores the bookable one', !r.html.includes('Y —'));
  check('ignores dates already past', !r.html.includes('Z —'));
}

console.log('\n6. A dead key must not look like a quiet day');
{
  // Every table 403s — what the first live run actually did.
  const fetchStub = async () => ({ ok: false, status: 403, text: async () => 'permission denied' });
  let threw = null;
  try { await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW }); } catch (e) { threw = e; }
  check('refuses to send', !!threw);
  check('names the likely cause', /SUPABASE_SERVICE_ROLE_KEY/.test(threw?.message || ''), threw?.message);
  check('says why it matters', /quiet day/.test(threw?.message || ''));
}

console.log('\n7. One dead table is still just a missing section');
{
  const fetchStub = async (url) => {
    if (url.includes('campaign_activity')) return { ok: false, status: 404, text: async () => 'gone' };
    if (url.includes('faculty')) return { ok: true, json: async () => [{ email: 'a@b.co', display_name: 'A B' }] };
    return { ok: true, json: async () => [] };
  };
  const r = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW });
  check('still sends', !!r.html);
  check('faculty still listed', r.html.includes('A B'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
