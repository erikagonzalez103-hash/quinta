import { run } from './waitlist-alerts.mjs';

const NOW = new Date('2026-08-26T15:00:00Z');
const env = { SUPABASE_SERVICE_ROLE_KEY: 'svc', RESEND_API_KEY: 'rsnd' };

function harness({ rows, failAlert = false, failConfirm = false, failPatch = false }) {
  const calls = { emails: [], patches: [] };
  const fetch = async (url, init = {}) => {
    if (url.includes('/rest/v1/waitlist?notified_at=is.null'))
      return { ok: true, json: async () => rows };
    if (url.includes('api.resend.com')) {
      const msg = JSON.parse(init.body);
      const isAlert = msg.to[0] === 'erika@quintaand.co';
      calls.emails.push({ to: msg.to[0], subject: msg.subject, kind: isAlert ? 'alert' : 'confirm' });
      if (isAlert && failAlert) return { ok: false, status: 422, text: async () => 'domain not verified' };
      if (!isAlert && failConfirm) return { ok: false, status: 400, text: async () => 'bad address' };
      return { ok: true };
    }
    if (init.method === 'PATCH') {
      calls.patches.push(url.split('id=eq.')[1]);
      return failPatch ? { ok: false, status: 401, text: async () => 'no write access' } : { ok: true };
    }
    throw new Error('unexpected fetch: ' + url);
  };
  return { fetch, calls };
}

const fresh = { id: 'r1', created_at: '2026-08-26T14:30:00Z', name: 'Robin Frazier',
  email: 'robin@enjoyyourhaven.com', class_name: 'Bookkeeping II', source: 'site', ref: 'tara26' };
const old   = { id: 'r2', created_at: '2026-08-19T01:25:00Z', name: 'Old Signup',
  email: 'old@example.com', class_name: 'Taxes', source: 'site', ref: null };

const log = () => {};
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
};

console.log('\n1. No new signups');
{
  const h = harness({ rows: [] });
  const r = await run({ fetch: h.fetch, env, log, now: () => NOW });
  check('sends nothing', h.calls.emails.length === 0);
  check('stamps nothing', h.calls.patches.length === 0);
  check('reports 0', r.sent === 0);
}

console.log('\n2. A fresh signup (30 min old)');
{
  const h = harness({ rows: [fresh] });
  const r = await run({ fetch: h.fetch, env, log, now: () => NOW });
  check('alerts Erika', h.calls.emails.some(e => e.kind === 'alert' && e.to === 'erika@quintaand.co'));
  check('confirms to her', h.calls.emails.some(e => e.kind === 'confirm' && e.to === 'robin@enjoyyourhaven.com'));
  check('subject names the class', h.calls.emails[0].subject.includes('Bookkeeping II'));
  check('stamps the row', h.calls.patches[0] === 'r1');
  check('reports 1', r.sent === 1);
}

console.log('\n3. A stale signup (7 days old)');
{
  const h = harness({ rows: [old] });
  await run({ fetch: h.fetch, env, log, now: () => NOW });
  check('still alerts Erika', h.calls.emails.some(e => e.kind === 'alert'));
  check('sends NO late confirmation', !h.calls.emails.some(e => e.kind === 'confirm'));
  check('still stamps it', h.calls.patches[0] === 'r2');
}

console.log("\n4. Erika's alert fails");
{
  const h = harness({ rows: [fresh], failAlert: true });
  let threw = null;
  try { await run({ fetch: h.fetch, env, log, now: () => NOW }); } catch (e) { threw = e; }
  check('throws so the workflow goes red', !!threw);
  check('does NOT stamp — retried next run', h.calls.patches.length === 0);
  check('does NOT confirm to her either', !h.calls.emails.some(e => e.kind === 'confirm'));
  check('names the cause', /domain not verified/.test(threw?.message || ''), threw?.message);
}

console.log('\n5. Confirmation fails but alert worked');
{
  const h = harness({ rows: [fresh], failConfirm: true });
  let threw = null;
  try { await run({ fetch: h.fetch, env, log, now: () => NOW }); } catch (e) { threw = e; }
  check('still stamps (no alert loop)', h.calls.patches[0] === 'r1');
  check('but still reports the failure', /confirmation to robin/.test(threw?.message || ''));
}

console.log('\n6. Cannot stamp the row');
{
  const h = harness({ rows: [fresh], failPatch: true });
  let threw = null;
  try { await run({ fetch: h.fetch, env, log, now: () => NOW }); } catch (e) { threw = e; }
  check('warns it will re-send', /WILL be emailed again/.test(threw?.message || ''), threw?.message);
}

console.log('\n7. Missing secrets');
{
  const h = harness({ rows: [] });
  let threw = null;
  try { await run({ fetch: h.fetch, env: {}, log, now: () => NOW }); } catch (e) { threw = e; }
  check('refuses to run', /Missing secret/.test(threw?.message || ''), threw?.message);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
