import { run, startOfDallasDay, dallasDay, buildReport, kitCard, salesBySource, salesCard, rsvpCard, upcomingClasses, upcomingCard, dallasInstant } from './daily-report.mjs';

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
    if (url.includes('/event_rsvps?')) return { ok: false, status: 404, text: async () => 'no such table' };
    throw new Error('unexpected ' + url);
  };
  const r = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: NOW });
  check('produced a report anyway', !!r.html);
  check('faculty still listed', r.html.includes('Tara Johnson'));
  check('no RSVP card before its table exists', !r.html.includes('October 21 RSVPs'));
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

console.log('\nOctober 21 RSVPs (event_rsvps)');
{
  const since = '2026-10-19T05:00:00.000Z';
  const rows = [
    { name: 'Ana Old', email: 'ana@x.com', marketing_ok: false, ref: null, created_at: '2026-10-18T15:00:00Z' },
    { name: 'Bea New', email: 'bea@x.com', marketing_ok: true, ref: 'tara', created_at: '2026-10-19T15:00:00Z' },
    { name: '<b>Cy</b>', email: 'cy@x.com', marketing_ok: false, ref: 'tara', created_at: '2026-10-19T16:00:00Z' },
  ];
  const html = rsvpCard(rows, since);
  check('counts today apart from all time', /Today<\/strong>[\s\S]*?<strong>2<\/strong>/.test(html) && /All RSVPs so far[\s\S]*?>3</.test(html));
  check('counts who said yes to promotional email', /promotional email[\s\S]*?>1</.test(html));
  check("lists today's names, not yesterday's", html.includes('Bea New') && !html.includes('Ana Old'));
  check('marks the email opt-in', html.includes('emails ok'));
  check('credits the teacher', /From teacher links[\s\S]*tara[\s\S]*?>2</.test(html));
  check('escapes names', !html.includes('<b>Cy</b>'));
  check('quiet so far says so', rsvpCard([], since).includes('No RSVPs yet'));
  check('missing table leaves the card out', rsvpCard(null, since) === '');
}

console.log('\n12. Upcoming classes: instructor, headcount, the 48-hour cancel-by');
{
  // Report sent Fri 13 Nov 2026, 7am Dallas (CST, UTC-6).
  const ranAt = new Date('2026-11-13T13:00:00Z');
  check('Dallas class time becomes the right instant', dallasInstant('2026-11-16', '18:00:00').toISOString() === '2026-11-17T00:00:00.000Z',
    dallasInstant('2026-11-16', '18:00:00').toISOString());
  const sessions = [
    { id: 's1', class_slug: 'brand-101', class_name: 'Brand 101', session_date: '2026-11-14', start_time: '10:00:00', instructor_name: 'Stephanie R' },
    { id: 's2', class_slug: 'module-1', class_name: 'Claude Module 1', session_date: '2026-11-16', start_time: '18:00:00', instructor_name: 'Erika G' },
    { id: 's3', class_slug: 'taxes', class_name: 'Read Your Own Return', session_date: '2026-11-15', start_time: '13:00:00', instructor_name: 'Lupe M' },
    { id: 's4', class_slug: 'landlord', class_name: 'Landlord', session_date: '2026-11-13', start_time: '06:00:00', instructor_name: 'Robin' },
  ];
  const seats = [
    // Brand 101: one Cal.com seat (slug + date), one Stripe seat (session_id) -> running
    { id: 'a', class_slug: 'brand-101', session_on: '2026-11-14', status: 'booked' },
    { id: 'b', session_id: 's1', class_slug: 'brand-101', session_on: null, status: 'booked' },
    // Module 1: one booked, one bank pending -> under, deadline Sat 14 Nov 6pm (still ahead)
    { id: 'c', class_slug: 'module-1', session_on: '2026-11-16', status: 'booked' },
    { id: 'd', session_id: 's2', class_slug: 'module-1', status: 'pending' },
    // a Module 1 seat on another date must not count
    { id: 'e', class_slug: 'module-1', session_on: '2026-11-20', status: 'booked' },
    // Taxes Sun 1pm: nobody -> under, cancel-by Fri 13 Nov 1pm, still a few hours ahead
  ];
  const up = upcomingClasses(sessions, seats, ranAt);
  check('a class that already started is left out', !up.some((c) => c.s.id === 's4'));
  check('soonest first', up.map((c) => c.s.id).join() === 's1,s3,s2', up.map((c) => c.s.id).join());
  const brand = up.find((c) => c.s.id === 's1'), mod = up.find((c) => c.s.id === 's2'), tax = up.find((c) => c.s.id === 's3');
  check('counts Cal.com and Stripe seats together', brand.n === 2 && !brand.short);
  check('pending is shown, not counted', mod.n === 1 && mod.pending === 1 && mod.short);
  check('cancel-by is 48 hours before start', mod.cancelBy.toISOString() === '2026-11-15T00:00:00.000Z', mod.cancelBy.toISOString());
  check('a full class is never late, even inside 48 hours', !brand.late);
  check('an empty class is short but not yet late before its cancel-by', tax.n === 0 && tax.short && !tax.late);
  const lateClass = upcomingClasses([sessions[0]], [], ranAt)[0];
  check('under minimum and past the cancel-by is flagged late', lateClass.short && lateClass.late);

  const html = upcomingCard(up);
  check('names the instructor', html.includes('Stephanie R') && html.includes('Lupe M'));
  check('shows the count against the minimum', /<strong>1<\/strong> of 2 min/.test(html));
  check('shows bank pending', html.includes('+1 bank pending'));
  check('gives the cancel-by time', html.includes('cancel by Sat, Nov 14, 6 PM'), html.match(/cancel by[^<]*/)?.[0]);
  check('marks running classes', html.includes('running'));
  check('leads with how many are short', html.includes('2 classes are under the 2-person minimum'));
  check('empty week says so', upcomingCard([]).includes('Nothing on the schedule'));
  check('unreadable is not "no classes"', upcomingCard([], { unreadable: true }).includes('NOT'));

  const base = { now: ranAt, posts: {}, faculty: [], signups: [], referrals: [], sessionsToday: [], unbookable: [] };
  const r = buildReport({ ...base, upcoming: up, salesToday: [{ order_ref: 'x', amount_cents: 9900 }] });
  check('subject carries sales and classes under minimum', /1 sale · 2 classes under minimum/.test(r.subject), r.subject);
  check('card sits right after sales', r.html.indexOf('Sales by source') < r.html.indexOf('Upcoming classes')
    && r.html.indexOf('Upcoming classes') < r.html.indexOf('The Swarm today'));

  // Through run(): the right queries, and seats from both lookups merged once.
  const urls = [];
  const fetchStub = async (url) => {
    urls.push(url);
    if (url.includes('/faculty?')) return { ok: true, json: async () => [{ email: 'a@b.co', display_name: 'A B' }] };
    if (url.includes('class_sessions?') && url.includes('session_date=gte')) return { ok: true, json: async () => sessions };
    if (url.includes('enrollments?') && url.includes('session_on=gte')) return { ok: true, json: async () => seats.filter((x) => x.session_on) };
    if (url.includes('enrollments?') && url.includes('session_id=in')) return { ok: true, json: async () => seats.filter((x) => x.session_id) };
    return { ok: true, json: async () => [] };
  };
  const rr = await run({ fetch: fetchStub, env: { DRY_RUN: '1' }, log: () => {}, now: ranAt });
  check('run() includes the card', rr.html.includes('Upcoming classes') && rr.html.includes('Claude Module 1'));
  check('looks 4 days ahead from the send day', urls.some((u) => u.includes('session_date=gte.2026-11-13&session_date=lte.2026-11-16')));
  check('keeps sessions with no status', urls.some((u) => u.includes('or=(status.is.null,status.neq.canceled)')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
