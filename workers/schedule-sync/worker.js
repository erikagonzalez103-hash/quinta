/**
 * Quinta & Co. — class schedule sync
 *
 * WHAT IT DOES
 * An instructor saves a class date in the faculty portal. Supabase fires a
 * webhook at this Worker. The Worker rebuilds that class's dates in Cal.com,
 * then checks whether a student could actually book them, and writes the answer
 * back so a silent failure shows up in the portal instead of nowhere.
 *
 * WHY THE VERIFY STEP EXISTS
 * Twice in one evening a date looked saved and was never bookable — once because
 * a personal calendar blocked it, once because Cal.com refuses to create a slot
 * for a 2-hour class starting on the half hour. Both were invisible. Now they
 * come back as a sentence.
 *
 * SECRETS (set with `wrangler secret put`, never in this file)
 *   CAL_API_KEY     - Cal.com API key
 *   SYNC_TOKEN      - shared secret for the two Supabase functions
 *   WEBHOOK_SECRET  - what Supabase sends so we know a request is really from it
 *
 * VARS (plain, safe to see)
 *   SUPABASE_URL, SUPABASE_ANON_KEY, CAL_USERNAME, SHARED_EMPTY_SCHEDULE_ID
 */

const CAL_API = "https://api.cal.com/v2";
const TZ = "America/Chicago";

/* ---------- small helpers ---------- */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 1), {
    status,
    headers: { "content-type": "application/json" },
  });

function calHeaders(env, version = "2024-06-14") {
  return {
    Authorization: `Bearer ${env.CAL_API_KEY}`,
    "cal-api-version": version,
    "Content-Type": "application/json",
  };
}

async function calGet(env, path, version) {
  const r = await fetch(CAL_API + path, { headers: calHeaders(env, version) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Cal.com GET ${path} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function calSend(env, method, path, payload, version) {
  const r = await fetch(CAL_API + path, {
    method,
    headers: calHeaders(env, version),
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Cal.com ${method} ${path} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

/** Call one of the two token-gated Supabase functions. */
async function rpc(env, fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sync_token: env.SYNC_TOKEN, ...args }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${fn} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

/** "18:00:00" + 90 → "19:30". Pure arithmetic; no Date, no timezone to get wrong. */
function addMinutes(hhmmss, minutes) {
  const [h, m] = String(hhmmss).slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A UTC instant → what a Dallas clock reads, "2026-09-09 18:00". Handles DST. */
function inDallas(utcIso) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(utcIso));
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/* ---------- the work ---------- */

async function syncClass(env, slug) {
  const report = { slug, ok: false, sessions: [], notes: [] };

  // 1. The class in Cal.com
  const all = await calGet(env, `/event-types?username=${env.CAL_USERNAME}`);
  const event = (all.data || []).find((e) => e.slug === slug);
  if (!event) {
    report.notes.push(`No Cal.com class with the slug "${slug}" — nothing to sync.`);
    return report;
  }
  const duration = event.lengthInMinutes;

  // 2. The dates the instructor has set
  const sessions = await rpc(env, "schedule_sync_read", { want_slug: slug });
  report.sessionCount = sessions.length;

  // 3. Its own schedule. The "no dates set" schedule is shared by every class
  //    without dates — writing to it would give all of them these dates.
  let scheduleId = event.scheduleId;
  const sharedId = Number(env.SHARED_EMPTY_SCHEDULE_ID || 0);
  if (!scheduleId || scheduleId === sharedId) {
    const made = await calSend(env, "POST", "/schedules", {
      name: `${event.title} — dates`,
      timeZone: TZ,
      isDefault: false,
      availability: [],
      overrides: [],
    }, "2024-06-11");
    scheduleId = made.data.id;
    await calSend(env, "PATCH", `/event-types/${event.id}`, { scheduleId });
    report.notes.push(`Created a schedule for this class (#${scheduleId}) and pinned it.`);
  }

  // 4. Anything already booked must survive, even if the instructor removed the
  //    date. Pulling a slot out from under a paying student is worse than a
  //    stale date, so we keep it and say so.
  const booked = new Set();
  try {
    const bk = await calGet(env, `/bookings?take=100`, "2024-08-13");
    for (const b of bk.data || []) {
      const s = (b.eventType || {}).slug;
      const status = String(b.status || "").toLowerCase();
      if (s === slug && status !== "cancelled" && status !== "canceled") {
        booked.add(inDallas(b.start));
      }
    }
  } catch (e) {
    report.notes.push(`Couldn't read bookings (${e.message}) — kept every existing date to be safe.`);
  }

  // 5. Build the override set from the live sessions
  const overrides = [];
  const wanted = [];
  for (const s of sessions) {
    const start = String(s.start_time).slice(0, 5);
    overrides.push({ date: s.session_date, startTime: start, endTime: addMinutes(s.start_time, duration) });
    wanted.push({ id: s.session_id, date: s.session_date, start, key: `${s.session_date} ${start}` });
  }

  // keep any booked slot the instructor has since removed
  const existing = await calGet(env, `/schedules/${scheduleId}`, "2024-06-11");
  for (const o of (existing.data || {}).overrides || []) {
    const key = `${o.date} ${String(o.startTime).slice(0, 5)}`;
    const stillWanted = overrides.some((x) => x.date === o.date && x.startTime === o.startTime);
    if (!stillWanted && booked.has(key)) {
      overrides.push(o);
      report.notes.push(`Kept ${key} — it was removed from the portal but a student is booked. Needs a human.`);
    }
  }

  await calSend(env, "PATCH", `/schedules/${scheduleId}`, {
    name: existing.data?.name || `${event.title} — dates`,
    timeZone: TZ,
    overrides,
  }, "2024-06-11");

  // 6. Did that actually produce something bookable? Ask, don't assume.
  const dates = wanted.map((w) => w.date).sort();
  let live = new Set();
  if (dates.length) {
    const from = `${dates[0]}T00:00:00.000Z`;
    const to = `${dates[dates.length - 1]}T23:59:59.000Z`;
    const q = `/slots/available?eventTypeSlug=${slug}&usernameList[]=${env.CAL_USERNAME}` +
              `&startTime=${from}&endTime=${to}`;
    const s = await calGet(env, q);
    for (const day of Object.values((s.data || {}).slots || {})) {
      for (const slot of day) live.add(inDallas(slot.time));
    }
  }

  // 7. Write the verdict back against each session
  for (const w of wanted) {
    const bookable = live.has(w.key);
    let note = null;
    if (!bookable) {
      const [h, m] = w.start.split(":").map(Number);
      note = duration >= 120 && m !== 0
        ? `Not bookable: a ${duration / 60}-hour class has to start on the hour — Cal.com won't make a slot at ${w.start}.`
        : `Not bookable: the date synced, but Cal.com shows no slot. Usually something on Erika's calendar is blocking it.`;
    }
    await rpc(env, "schedule_sync_mark", { target_id: w.id, ok: bookable, note });
    report.sessions.push({ date: w.date, start: w.start, bookable, note });
  }

  report.ok = report.sessions.every((s) => s.bookable);
  report.scheduleId = scheduleId;
  return report;
}

/* ---------- entry point ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "quinta-schedule-sync" });
    }

    // Only Supabase (or you, with the secret) may trigger a sync.
    const given = request.headers.get("x-sync-secret") || url.searchParams.get("secret") || "";
    if (given !== env.WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);

    let slugs = [];
    if (url.searchParams.get("slug")) {
      slugs = [url.searchParams.get("slug")];            // manual: /?slug=insurance
    } else if (url.searchParams.get("all") === "1") {
      const rows = await rpc(env, "schedule_sync_read", {});
      slugs = [...new Set(rows.map((r) => r.class_slug))];
    } else {
      // Supabase webhook payload: record on insert/update, old_record on delete
      const body = await request.json().catch(() => ({}));
      const slug = body?.record?.class_slug || body?.old_record?.class_slug;
      if (!slug) return json({ error: "no class_slug in payload" }, 400);
      slugs = [slug];
    }

    const results = [];
    for (const slug of slugs) {
      try {
        results.push(await syncClass(env, slug));
      } catch (e) {
        results.push({ slug, ok: false, error: e.message });
      }
    }
    return json({ synced: results.length, results });
  },
};
