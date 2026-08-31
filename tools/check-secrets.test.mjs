import { describeKey, jwtRole, explain, probeWaitlist, run } from './check-secrets.mjs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };

/* A real-shaped legacy key: header.payload.signature, payload holding a role. */
const jwt = (role) =>
  'eyJhbGciOiJIUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ iss: 'supabase', ref: 'abc', role })).toString('base64url') +
  '.sig';

console.log('\n1. Telling the two Supabase keys apart');
{
  const secret = describeKey('K', 'sb_secret_abc123def456', 'supabase');
  check('a secret key passes', secret.ok === true);
  check('and is named as such', secret.kind === 'sb_secret_', secret.kind);

  const pub = describeKey('K', 'sb_publishable_t7U8S0paeslz99Y', 'supabase');
  check('the public key fails', pub.ok === false);
  check('and is called out by name', /PUBLIC KEY/.test(pub.verdict), pub.verdict);
  check('and says which one is needed', /sb_secret_/.test(pub.verdict));
}

console.log('\n2. Old-style JWT keys, by their role');
{
  check('reads the role claim', jwtRole(jwt('service_role')) === 'service_role');
  check('survives rubbish', jwtRole('not-a-jwt') === null);

  const svc = describeKey('K', jwt('service_role'), 'supabase');
  check('service_role passes', svc.ok === true);
  const anon = describeKey('K', jwt('anon'), 'supabase');
  check('anon fails', anon.ok === false);
  check('and names the role', /anon/.test(anon.verdict), anon.verdict);
}

console.log('\n3. The mistakes a person actually makes');
{
  check('not set at all', describeKey('K', '', 'supabase').verdict === 'NOT SET');
  check('not set is not "ok"', describeKey('K', undefined, 'supabase').ok === false);

  const spaced = describeKey('K', 'sb_secret_abc\n', 'supabase');
  check('a trailing newline is caught', spaced.ok === false);
  check('and explained plainly', /whitespace|space or newline/.test(spaced.verdict), spaced.verdict);

  const junk = describeKey('K', 'hunter2', 'supabase');
  check('an unrecognised shape fails', junk.ok === false && junk.kind === 'unrecognised');
}

console.log('\n4. The other two secrets');
{
  check('a Resend key passes', describeKey('K', 're_abc123', 're_').ok === true);
  check('a wrong Resend key fails', describeKey('K', 'sb_secret_x', 're_').ok === false);
  check('a Cal.com key passes', describeKey('K', 'cal_live_abc', 'cal_').ok === true);
}

console.log('\n5. Never leaks the key itself');
{
  const value = 'sb_secret_SUPERSECRETVALUE9999';
  const d = describeKey('K', value, 'supabase');
  const printed = JSON.stringify(d);
  check('the random part never appears', !printed.includes('SUPERSECRETVALUE9999'), printed);
  check('only the type prefix does', printed.includes('sb_secret_'));
  check('the length is reported', d.len === value.length);
}

console.log('\n6. Turning a status code into an instruction');
{
  check('200 says it is fixed', /readable/.test(explain(200, '')));
  check('403 + 42501 blames the public key',
    /PUBLIC key|public key/i.test(explain(403, '{"code":"42501"}')), explain(403, '{"code":"42501"}'));
  check('401 says the key is not recognised', /does not recognise/.test(explain(401, '')));
}

console.log('\n7. End to end, against a stubbed Supabase');
{
  const lines = [];
  const log = (s) => lines.push(s);

  const broken = await run({
    env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_abc', RESEND_API_KEY: 're_x', CAL_API_KEY: 'cal_live_x' },
    fetchImpl: async () => ({ status: 403, ok: false, text: async () => '{"code":"42501","message":"permission denied for table waitlist"}' }),
    log,
  });
  check('a public key is reported as not ok', broken.ok === false);
  check('the output names the real problem', lines.join('\n').includes('PUBLIC KEY'));
  check('and never prints the key', !lines.join('\n').includes('sb_publishable_abc'));

  lines.length = 0;
  const fixed = await run({
    env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc', RESEND_API_KEY: 're_x', CAL_API_KEY: 'cal_live_x' },
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => '[]' }),
    log,
  });
  check('a working key comes back ok', fixed.ok === true);
  check('and says what to do next', /run it next/.test(lines.join('\n')));

  lines.length = 0;
  const unset = await run({ env: {}, fetchImpl: async () => { throw new Error('should not be called'); }, log });
  check('an unset secret is not probed', unset.ok === false);
}

console.log('\n8. probeWaitlist sends the key both ways Supabase expects');
{
  let seen = null;
  await probeWaitlist(async (url, opts) => { seen = { url, opts }; return { status: 200, ok: true, text: async () => '[]' }; }, 'K');
  check('asks the waitlist table', /waitlist\?select=id/.test(seen.url), seen.url);
  check('sends apikey', seen.opts.headers.apikey === 'K');
  check('sends Authorization', seen.opts.headers.Authorization === 'Bearer K');
}

console.log('\n9. An unreachable Supabase is not a bad key');
{
  const lines = [];
  const r = await run({
    env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc' },
    fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); },
    log: (s) => lines.push(s),
  });
  check('does not pass', r.ok === false);
  check('but says the network was the problem', r.unreachable === true);
  check('and says so in words', /says nothing about the key/.test(lines.join('\n')), lines.join(' '));
  check('and does not blame the key', !/PUBLIC KEY/.test(lines.join('\n')));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
