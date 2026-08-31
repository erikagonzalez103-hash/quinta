/**
 * Quinta & Co. — set the Cal.com prices for a sale, and put them back
 *
 * WHY THIS EXISTS
 * The website reads its prices from classes.js. Cal.com reads its own. A sale
 * means changing both, and the one that actually takes the money is Cal.com.
 * Doing that by hand across nine event types is how a class ends up
 * advertised at $131 and charged at $175 — the exact mismatch classes.js
 * warns about. This script makes classes.js the single source of truth and
 * pushes it to Cal.com.
 *
 * WHY API v1 AND NOT v2
 * The Stripe price lives in the event type's `metadata.apps.stripe`, and API
 * v2 cannot edit event-type metadata at all (calcom/cal.diy#18442, open since
 * January 2025). v1 can. The schedule-sync Worker still uses v2 for schedules,
 * which v2 does handle — the two are not in conflict, they just do different
 * jobs with different versions.
 *
 * PRICES ARE IN CENTS
 * Cal.com stores the price in the smallest currency unit — its own UI runs
 * every value through convertToSmallestCurrencyUnit on the way in. $131 is
 * 13100. Getting this wrong charges $1.31 or $13,100, so the script refuses
 * to write anything but USD rather than guess at a currency it hasn't been
 * taught.
 *
 * SECRET: CAL_API_KEY (a Cal.com API key — Settings → Developer → API keys).
 *   Never in the repo. GitHub Actions secret, or an env var in your shell.
 *
 * USAGE
 *   node tools/set-sale-prices.mjs --sale             # dry run: what WOULD change
 *   node tools/set-sale-prices.mjs --sale --apply     # actually set sale prices
 *   node tools/set-sale-prices.mjs --list             # dry run: back to list price
 *   node tools/set-sale-prices.mjs --list --apply     # actually put them back
 *   node tools/set-sale-prices.mjs --sale --only=module-1,module-2
 *
 * It is a dry run unless you pass --apply. That is deliberate: this script
 * moves real money.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CAL_API = "https://api.cal.com/v1";

/* ---------------------------------------------------------------- classes */

/* classes.js is a plain browser script, not a module. Reading it here rather
   than duplicating the prices keeps one source of truth — a second copy of a
   price is a second thing to get wrong. */
export function parseClasses(source) {
  const fn = new Function(`${source}; return QUINTA_CLASSES;`);
  return fn();
}

export function readClasses(dir) {
  return parseClasses(readFileSync(join(dir, "classes.js"), "utf8"));
}

/* ------------------------------------------------------------------ money */

/* USD only, on purpose. Cal.com supports zero-decimal currencies (yen has no
   cents) where this multiplication would be wrong by a factor of a hundred.
   Rather than carry a currency table we do not need, refuse the ones we have
   not been taught. */
export function dollarsToCents(dollars, currency = "usd") {
  if (String(currency).toLowerCase() !== "usd") {
    throw new Error(`Refusing to convert ${currency} — this script only knows USD.`);
  }
  if (!Number.isFinite(dollars) || dollars <= 0) {
    throw new Error(`Not a price: ${dollars}`);
  }
  return Math.round(dollars * 100);
}

export const centsToDollars = (cents) => (cents / 100).toFixed(2).replace(/\.00$/, "");

/* ------------------------------------------------------------------- plan */

/* What each class SHOULD cost in the chosen mode. "sale" only touches classes
   that carry a salePrice; "list" puts every one of those back. A class with
   no salePrice is not in the sale and is never touched in either direction —
   that is what keeps another teacher's class out of a discount she has not
   agreed to. */
export function planFor(classes, mode, only = null) {
  const wanted = only && only.length ? new Set(only) : null;
  return classes
    .filter((c) => c.booking && !c.free && !c.soon)
    .filter((c) => typeof c.salePrice === "number" && c.salePrice > 0)
    .filter((c) => !wanted || wanted.has(c.slug))
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      listPrice: c.price,
      salePrice: c.salePrice,
      target: mode === "sale" ? c.salePrice : c.price,
    }));
}

/* --------------------------------------------------------------- metadata */

/* Merge rather than replace. An event type's metadata holds every app's
   settings, not just Stripe's — a wholesale PATCH would quietly delete
   whatever else is configured there. */
export function mergeStripePrice(metadata, cents) {
  const md = metadata && typeof metadata === "object" ? metadata : {};
  const apps = md.apps && typeof md.apps === "object" ? md.apps : {};
  const stripe = apps.stripe && typeof apps.stripe === "object" ? apps.stripe : {};
  return { ...md, apps: { ...apps, stripe: { ...stripe, price: cents } } };
}

/* Whether we are allowed to touch this event at all, and why not if we are
   not. Refusing loudly beats writing a price onto a class that was never set
   up to charge for one. */
export function checkEvent(event, plan) {
  if (!event) return { ok: false, reason: `no Cal.com event type with the slug "${plan.slug}"` };

  const stripe = event?.metadata?.apps?.stripe;
  if (!stripe) {
    return { ok: false, reason: "the Stripe app is not set up on this event — set the first price by hand" };
  }
  if (stripe.enabled === false) {
    return { ok: false, reason: "the Stripe app is switched off on this event" };
  }
  const currency = String(stripe.currency || "usd").toLowerCase();
  if (currency !== "usd") {
    return { ok: false, reason: `priced in ${currency}, and this script only knows USD` };
  }

  const current = Number(stripe.price);
  if (!Number.isFinite(current)) {
    return { ok: false, reason: "the current price is not a number" };
  }

  /* The current price should be either the list price or the sale price. If
     it is neither, someone changed it in the dashboard and classes.js no
     longer describes reality — which is exactly the case where overwriting it
     would destroy the real number. Stop and say so. */
  const listCents = dollarsToCents(plan.listPrice, currency);
  const saleCents = dollarsToCents(plan.salePrice, currency);
  if (current !== listCents && current !== saleCents) {
    return {
      ok: false,
      reason: `Cal.com says $${centsToDollars(current)}, but classes.js says $${plan.listPrice} ` +
              `(sale $${plan.salePrice}). One of them is wrong — fix that before running this.`,
    };
  }

  const targetCents = dollarsToCents(plan.target, currency);
  return { ok: true, currency, current, target: targetCents, changed: current !== targetCents };
}

/* -------------------------------------------------------------- cal.com io */

async function calGet(path, key) {
  const r = await fetch(`${CAL_API}${path}${path.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(key)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Cal.com GET ${path} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function calPatch(path, key, payload) {
  const r = await fetch(`${CAL_API}${path}?apiKey=${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Cal.com PATCH ${path} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

/* ------------------------------------------------------------------- main */

export function parseArgs(argv) {
  const has = (f) => argv.includes(f);
  const only = (argv.find((a) => a.startsWith("--only=")) || "").slice(7);
  const mode = has("--list") ? "list" : has("--sale") ? "sale" : null;
  return {
    mode,
    apply: has("--apply"),
    only: only ? only.split(",").map((s) => s.trim()).filter(Boolean) : null,
  };
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const { mode, apply, only } = parseArgs(argv);

  if (!mode) {
    console.error("Say which prices you want: --sale or --list. Nothing was changed.");
    process.exitCode = 1;
    return;
  }
  const key = env.CAL_API_KEY;
  if (!key) {
    console.error("CAL_API_KEY is not set. It is a secret — set it in your shell or in GitHub Actions, never in the repo.");
    process.exitCode = 1;
    return;
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const plans = planFor(readClasses(root), mode, only);

  if (!plans.length) {
    /* In --list mode this is very likely the ordering mistake: the salePrice
       lines were deleted from classes.js first, so nothing here knows which
       classes to put back — while Cal.com is still quietly charging the sale
       price. Say that, rather than "nothing to do". */
    if (mode === "list") {
      console.log(
        "No class in classes.js carries a salePrice, so there is nothing to put back —\n" +
        "but if you already deleted those lines, Cal.com may STILL be on sale prices.\n" +
        "Recover them (git restore classes.js), run --list --apply, then delete them."
      );
      process.exitCode = 1;
      return;
    }
    console.log("No class in classes.js carries a salePrice — nothing to set.");
    return;
  }

  const all = await calGet("/event-types", key);
  const events = all.event_types || all.eventTypes || [];
  const bySlug = new Map(events.map((e) => [e.slug, e]));

  console.log(`\n${apply ? "Setting" : "DRY RUN — would set"} ${mode === "sale" ? "SALE" : "LIST"} prices on Cal.com\n`);

  let changed = 0, skipped = 0, blocked = 0;

  for (const plan of plans) {
    const event = bySlug.get(plan.slug);
    const verdict = checkEvent(event, plan);

    if (!verdict.ok) {
      console.log(`  ✗ ${plan.slug.padEnd(20)} ${verdict.reason}`);
      blocked++;
      continue;
    }
    if (!verdict.changed) {
      console.log(`  · ${plan.slug.padEnd(20)} already $${centsToDollars(verdict.target)}`);
      skipped++;
      continue;
    }

    const line = `${plan.slug.padEnd(20)} $${centsToDollars(verdict.current)} → $${centsToDollars(verdict.target)}`;
    if (!apply) {
      console.log(`  → ${line}`);
      changed++;
      continue;
    }

    await calPatch(`/event-types/${event.id}`, key, {
      metadata: mergeStripePrice(event.metadata, verdict.target),
    });
    console.log(`  ✓ ${line}`);
    changed++;
  }

  console.log(
    `\n${changed} ${apply ? "changed" : "to change"}, ${skipped} already right, ${blocked} refused.`
  );
  if (blocked) {
    console.log("Anything refused above needs a person — the script will not guess at a price.");
  }
  if (!apply && changed) {
    console.log("Nothing was written. Re-run with --apply to make it real.");
  }
  if (apply && mode === "sale") {
    console.log("Cal.com now charges the sale price. FALL25-SALE.md has the way back out.");
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("set-sale-prices.mjs");
if (invokedDirectly) {
  run().catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    process.exitCode = 1;
  });
}
