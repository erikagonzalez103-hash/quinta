/**
 * Quinta & Co. — what is actually in the secrets?
 *
 * WHY THIS EXISTS
 * Waitlist alerts failed 43 times in a row with "permission denied for table
 * waitlist", which means the key reaching it was the wrong KIND of key. There
 * was no way to check that without being able to see the secret, and a secret
 * you can see is not a secret. So you fix it, run it, and hope.
 *
 * This says which kind of key each secret holds — never the key itself — and
 * then makes the one read that has been failing, so the answer is a fact
 * rather than a guess.
 *
 * WHAT IT WILL AND WILL NOT PRINT
 * It prints the TYPE PREFIX ("sb_secret_", "sb_publishable_") and the length.
 * It never prints the random part of a key. For an old-style JWT key it
 * decodes only the `role` claim, which is the field that decides what the key
 * may read. Nothing here is enough to use a key with.
 *
 * RUN IT: Actions → "Check secrets" → Run workflow.
 * Green means the waitlist is readable. Red means it is not, and the output
 * says which of the two keys is in there.
 */

const SUPABASE_URL = "https://pmpaslevwimofohirves.supabase.co";

/* The role claim inside an old-style Supabase JWT. "anon" is the public key
   and cannot read the waitlist; "service_role" is the one that can. Only the
   role is read, never the signature. */
export function jwtRole(key) {
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json.role === "string" ? json.role : null;
  } catch { return null; }
}

/**
 * What kind of key is this, and is it the one we want?
 * `want` is "secret" for Supabase (must bypass row-level security), or a
 * plain prefix for the others.
 */
export function describeKey(name, value, want) {
  if (!value) return { name, set: false, ok: false, verdict: "NOT SET" };

  const len = value.length;
  const trimmed = value.trim();
  if (trimmed !== value) {
    return { name, set: true, ok: false, len,
             verdict: "has a stray space or newline — re-paste it without the whitespace" };
  }

  if (want === "supabase") {
    if (value.startsWith("sb_secret_")) {
      return { name, set: true, ok: true, len, kind: "sb_secret_", verdict: "secret key — correct" };
    }
    if (value.startsWith("sb_publishable_")) {
      return { name, set: true, ok: false, len, kind: "sb_publishable_",
               verdict: "THIS IS THE PUBLIC KEY — it cannot read the waitlist. You need the sb_secret_ one." };
    }
    if (value.startsWith("eyJ")) {
      const role = jwtRole(value);
      const ok = role === "service_role";
      return { name, set: true, ok, len, kind: `legacy JWT (role: ${role || "unreadable"})`,
               verdict: ok ? "legacy service_role key — works, but Supabase is retiring these"
                           : `legacy "${role || "unknown"}" key — this role cannot read the waitlist` };
    }
    return { name, set: true, ok: false, len, kind: "unrecognised",
             verdict: "not a shape this script recognises — check you copied a whole key" };
  }

  const ok = value.startsWith(want);
  return { name, set: true, ok, len, kind: ok ? want : "unrecognised",
           verdict: ok ? "looks right" : `expected it to start with "${want}"` };
}

/* The read that has been failing. Its status code is the whole diagnosis:
     200   readable — fixed
     403   the key is recognised but its role has no permission (wrong key)
     401   the key itself is not recognised (dead, revoked or mistyped) */
export async function probeWaitlist(fetchImpl, key) {
  if (!key) return { skipped: true };
  let r;
  try {
    r = await fetchImpl(`${SUPABASE_URL}/rest/v1/waitlist?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  } catch (e) {
    /* Supabase unreachable is not the same as the key being wrong, and
       reporting it as one would send someone rotating a perfectly good key. */
    return { unreachable: true, error: e.message };
  }
  const body = await r.text().catch(() => "");
  return { status: r.status, ok: r.ok, body: body.slice(0, 300) };
}

export function explain(status, body) {
  if (status === 200) return "The waitlist is readable. Waitlist alerts will work — run it next.";
  if (status === 403 && body.includes("42501")) {
    return "The key is recognised, but the role it maps to has no permission to read the waitlist.\n" +
           "That is what the PUBLIC key does. Replace SUPABASE_SERVICE_ROLE_KEY with the sb_secret_ key\n" +
           "(Supabase → Project Settings → API Keys → Secret keys).";
  }
  if (status === 401) {
    return "Supabase does not recognise this key at all — revoked, expired, or a partial paste.\n" +
           "Create a fresh secret key and paste the whole thing.";
  }
  return "Unexpected response — the body above is what Supabase said.";
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const checks = [
    describeKey("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY, "supabase"),
    describeKey("RESEND_API_KEY", env.RESEND_API_KEY, "re_"),
    describeKey("CAL_API_KEY", env.CAL_API_KEY, "cal_"),
  ];

  log("\nSecrets, by kind — never by value\n");
  for (const c of checks) {
    const mark = c.ok ? "✓" : c.set ? "✗" : "·";
    const kind = c.kind ? `${c.kind}, ` : "";
    const size = c.len ? `${kind}${c.len} chars — ` : "";
    log(`  ${mark} ${c.name.padEnd(26)} ${size}${c.verdict}`);
  }

  log("\nReading the waitlist with SUPABASE_SERVICE_ROLE_KEY\n");
  const probe = await probeWaitlist(fetchImpl, env.SUPABASE_SERVICE_ROLE_KEY);

  if (probe.skipped) {
    log("  · skipped — the secret is not set at all.");
    return { ok: false };
  }

  if (probe.unreachable) {
    log(`  · could not reach Supabase: ${probe.error}`);
    log("\nThis says nothing about the key — Supabase itself was unreachable. Try again in a minute.\n");
    return { ok: false, unreachable: true };
  }

  log(`  HTTP ${probe.status}`);
  if (probe.body) log(`  ${probe.body}`);
  log(`\n${explain(probe.status, probe.body)}\n`);

  /* CAL_API_KEY is not probed. A wrong one costs a red run on the price job
     and nothing else, whereas this read is the thing that has been silently
     failing for a week. */
  return { ok: probe.status === 200 };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("check-secrets.mjs");
if (invokedDirectly) {
  run()
    .then((r) => { if (!r.ok) process.exitCode = 1; })
    .catch((e) => { console.error(`Stopped: ${e.message}`); process.exitCode = 1; });
}
