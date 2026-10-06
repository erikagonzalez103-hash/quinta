import { run, startOfDallasDay, dallasDay, buildReport, kitCard, salesBySource, salesCard } from './daily-report.mjs';

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
    signups: [{ name: 'Dana Example', email: 'r@x.com', class_name: 'Bookkeeping II', ref: 'tara26' }],
    referrals: [{ ref: 'tara26', signups: 1 }, { ref: 'nik26', signups: 0 }],
    sessionsToday: [{ class_name: 'Brand 101', session_date: '2026-09-10', start_time: '18:00:00', instructor_name: 'Stephanie' }],
    unbookable: [{ class_name: 'Bookkeeping I', session_date: '2026-09-17', start_time: '17:30:00', note: 'a 2-hour class has to start on the hour' }],
  });
  check('subject carries the headline', /1 signup · 1\/2 posted · 1 unbookable/.test(r.subject), r.subject);
  check('names who posted', r.html.includes('Tara Johnson'));
  check('marks who did not', r.html.includes('nothing yet'));
  check('shows the signup and its credit', r.html.includes('Dana Example') && r.html.includes('via tara26'));
  check('shows zero-signup codes are hidden', !r.html.includes('nik26'));
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
    if (url.includes('/faculty?')) return { ok: true, json: async () => [{ email: 'tara@quintaand.co', display_name: 'Tara Johnson' }] };
    if (url.includes('waitlist')) return { ok: true, json: async () => [] };
    if (url.includes('class_sessions')) return { ok: true, json: async () => [] };
    if (url.includes('/enrollments?') || url.includes('/kit_events?')) return { ok: true, json: async () => [] };
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
    if (url.includes('/faculty?')) return { ok: true, json: async () => [] };
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
    if (url.includes('/faculty?')) return { ok: true, json: async () => [{ email: 'a@b.co', display_name: 'A B' }] };
    return { ok: true, json: async () => [] };
  };
  const r = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW });
  check('still sends', !!r.html);
  check('faculty still listed', r.html.includes('A B'));
}

console.log('\n8. A refused waitlist must never read as "no signups"');
{
  /* The live failure: waitlist 403s while the other tables answer, so the
     total-failure guard never fires and the report goes out green saying
     nothing happened. Signups were still arriving the whole time. */
  const fetchStub = async (url) => {
    if (url.includes('waitlist')) return { ok: false, status: 403, text: async () => 'permission denied for table waitlist' };
    if (url.includes('/faculty?')) return { ok: true, json: async () => [{ email: 'a@b.co', display_name: 'A B' }] };
    return { ok: true, json: async () => [] };
  };
  const r = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW });
  check('still sends the report', !!r.html);
  check('does NOT claim a quiet day', !r.html.includes('No signups today'));
  check('says the waitlist could not be read', /could not be read/.test(r.html));
  check('names the likely cause', /SUPABASE_SERVICE_ROLE_KEY|publishable key/.test(r.html));
  check('the subject carries it', /WAITLIST UNREADABLE/.test(r.subject), r.subject);
}

console.log('\n9. A genuinely quiet day still reads as one');
{
  const fetchStub = async (url) => {
    if (url.includes('/faculty?')) return { ok: true, json: async () => [{ email: 'a@b.co', display_name: 'A B' }] };
    return { ok: true, json: async () => [] };
  };
  const r = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW });
  check('says no signups', r.html.includes('No signups today'));
  check('and does not cry wolf', !/could not be read/.test(r.html));
  check('subject counts zero', /0 signups/.test(r.subject), r.subject);
}

console.log('\n10. Week 2 kit card');
{
  const F = [{ email: 'erika@quintaand.co', name: 'Erika G' }, { email: 'tara@example.com', name: 'Tara J' }, { email: 'nik@example.com', name: 'Nik S' }];
  const rows = [
    { faculty_email: 'tara@example.com', action: 'open', item: 'tara', created_at: '2026-10-07T15:00:00Z' },
    { faculty_email: 'tara@example.com', action: 'download', item: 'tara', created_at: '2026-10-07T15:01:00Z' },
    { faculty_email: 'tara@example.com', action: 'copy', item: 'tara:answers', created_at: '2026-10-07T15:02:00Z' },
    { faculty_email: 'erika@quintaand.co', action: 'open', item: 'erika', created_at: '2026-10-07T16:00:00Z' },
  ];
  const html = kitCard(rows, F, 'Week 2 kit');
  check('names who downloaded her Story', /Tara J.*downloaded her Story · 1 copy/.test(html));
  check('opened without downloading is marked', /Erika G.*no Story download · nothing copied/.test(html));
  check('names who has not opened it', /Nik S.*not opened yet/.test(html));
  check('counts the ones not in yet', html.includes("1 teacher hasn&#39;t opened it yet"));
  check('no table means no card (not "nobody")', kitCard(null, F, 'Week 2 kit') === '');
  const base = { now: new Date('2026-10-07T23:00:00Z'), posts: {}, faculty: F, signups: [], referrals: [], sessionsToday: [], unbookable: [] };
  check('appears in the report', buildReport({ ...base, kitRows: rows }).html.includes('Week 2 kit'));
  check('left out when the table is missing', !buildReport(base).html.includes('Week 2 kit'));
}

console.log('\n11. Sales by source');
{
  const rows = [
    // a 2-class Oct 21 order from the Meta ad: two rows, one order
    { order_ref: 'cs_A:s1', amount_cents: 14875, utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'FFF 250k' },
    { order_ref: 'cs_A:s2', amount_cents: 14875, utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'FFF 250k' },
    // a Cal.com bundle from LinkedIn: anchor paid, the rest owed at $0
    { order_ref: 'uid-B', amount_cents: 21200, utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'week2' },
    { order_ref: 'uid-B', amount_cents: 0, utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'week2' },
    // an untagged single class
    { order_ref: 'uid-C', amount_cents: 9900 },
    // a free redeem with nothing paid - not a sale
    { order_ref: 'uid-D', amount_cents: 0 },
  ];
  const g = salesBySource(rows);
  check('two rows of one order count as one sale', g.find((x) => x.src === 'facebook').n === 1);
  check('and add up', g.find((x) => x.src === 'facebook').cents === 29750);
  check('a bundle counts once at its price', g.find((x) => x.src === 'linkedin').cents === 21200);
  check('untagged sales are grouped', g.find((x) => x.src === '').n === 1);
  check('a $0 order is not a sale', g.reduce((t, x) => t + x.n, 0) === 3);
  const html = salesCard(rows, rows, 'Since Sept 29');
  check('Meta ads get a plain name', html.includes('Meta ads') && html.includes('FFF 250k'));
  check('shows the total', html.includes('3 sales · $608.50'));
  check('unreadable ledger is not "no sales"', salesCard(null, null, 'x').includes('NOT'));
  check('quiet day says so', salesCard([], [], 'x').includes('No sales today'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
