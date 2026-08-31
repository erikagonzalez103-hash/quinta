/**
 * Quinta & Co. — set the Cal.com prices for the sale, and put them back
 *
 * WHY THIS EXISTS
 * The website reads its prices from classes.js and config.js. Cal.com reads
 * its own. A sale means changing both, and the one that actually takes the
 * money is Cal.com. Doing that by hand is how a class ends up advertised at
 * $131 and charged at $175 — the exact mismatch classes.js warns about.
 *
 * WHAT DECIDES WHO IS ON SALE
 * The SALE list in config.js, and nothing else. Add a slug, run this with
 * --sale --apply, and that teacher is on. Remove it, run --list --apply, and
 * she is off. The discount is worked out from PERCENT_OFF, so there is never
 * a second number to keep in step.
 *
 * WHY API v1 AND NOT v2
 * The Stripe price lives in the event type's `metadata.apps.stripe`, and API
 * v2 cannot edit event-type metadata at all (calcom/cal.diy#18442, open since
 * January 2025). v1 can. The schedule-sync Worker still uses v2 for schedules,
 * which v2 does handle — the two do different jobs with different versions.
 *
 * PRICES ARE IN CENTS
 * Cal.com stores the price in the smallest currency unit — its own UI runs
 * every value through convertToSmallestCurrencyUnit on the way in. $131 is
 * 13100. Getting this wrong charges $1.31 or $13,100, so the script refuses
 * any currency but USD rather than guess at one it has not been taught.
 *
 * SECRET: CAL_API_KEY (Cal.com → Settings → Developer → API keys).
 *   Never in the repo. A GitHub Actions secret, or an env var in your shell.
 *
 * USAGE
 *   node tools/set-sale-prices.mjs --sale             # dry run: what WOULD change
 *   node tools/set-sale-prices.mjs --sale --apply     # put the sale prices on
 *   node tools/set-sale-prices.mjs --list             # dry run: back to full price
 *   node tools/set-sale-prices.mjs --list --apply     # take the sale prices off
 *   node tools/set-sale-prices.mjs --sale --only=module-1
 *
 * It is a dry run unless you pass --apply. That is deliberate: this moves
 * real money.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CAL_API = "https://api.cal.com/v1";

/* ------------------------------------------------------------ the site's data */

/* classes.js and config.js are plain browser scripts, not modules. Reading
   them here rather than duplicating their contents keeps one source of truth:
   a second copy of a price is a second thing to get wrong. */
export function parseClasses(source) {
  return new Function(`${source}; return QUINTA_CLASSES;`)();
}

export function parseConfig(source) {
  return new Function(`var window = {}; ${source}; return window.QUINTA_CONFIG;`)();
}

export function readSite(dir) {
  return {
    classes: parseClasses(readFileSync(join(dir, "classes.js"), "utf8")),
    config: parseConfig(readFileSync(join(dir, "config.js"), "utf8")),
  };
}

/* ------------------------------------------------------------------- money */

/* USD only, on purpose. Cal.com supports zero-decimal currencies (yen has no
   cents) where this multiplication would be wrong by a factor of a hundred.
   Rather than carry a currency table we do not need, refuse the rest. */
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

/* The one place the discount is worked out. Rounded DOWN to a whole dollar:
   the site's prices are whole dollars by convention, and rounding down never
   overcharges. Must match salePriceOf() in app.js. */
export function discounted(price, percentOff) {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!(percentOff > 0 && percentOff < 100)) return null;
  const p = Math.floor((price * (100 - percentOff)) / 100);
  return p > 0 && p < price ? p : null;
}

/* -------------------------------------------------------------------- plan */

const sellable = (c) => Boolean(c.booking) && !c.free && !c.soon &&
                        typeof c.price === "number" && c.price > 0;

/**
 * What each class SHOULD cost, in the chosen mode.
 *
 *   --sale  only the classes named in config.SALE.CLASSES
 *   --list  EVERY sellable class, back to its list price
 *
 * The asymmetry is on purpose. Putting prices back must not depend on the
 * sale list, because the natural way to end a sale is to empty that list —
 * and if --list only knew about classes still in it, emptying the list first
 * would leave Cal.com quietly charging sale prices with nothing left to say
 * so. Restoring a class already at its list price is a no-op, so casting the
 * wider net costs nothing.
 */
export function planFor(classes, config, mode, only = null) {
  const sale = (config && config.SALE) || {};
  const percentOff = Number(sale.PERCENT_OFF);
  const onSale = new Set(sale.CLASSES || []);
  const wanted = only && only.length ? new Set(only) : null;

  return classes
    .filter(sellable)
    .filter((c) => (mode === "sale" ? onSale.has(c.slug) : true))
    .filter((c) => !wanted || wanted.has(c.slug))
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      listPrice: c.price,
      /* What a sale price WOULD be for this class — computed even when it is
         not currently in the sale, so that taking a teacher back off still
         recognises the discounted figure sitting in Cal.com. */
      salePrice: discounted(c.price, percentOff),
      target: mode === "sale" ? discounted(c.price, percentOff) : c.price,
    }))
    .filter((p) => p.target !== null);
}

/* ---------------------------------------------------------------- metadata */

/* Merge rather than replace. An event type's metadata holds every app's
   settings, not just Stripe's — a wholesale PATCH would quietly delete
   whatever else is configured there. */
export function mergeStripePrice(metadata, cents) {
  const md = metadata && typeof metadata === "object" ? metadata : {};
  const apps = md.apps && typeof md.apps === "object" ? md.apps : {};
  const stripe = apps.stripe && typeof apps.stripe === "object" ? apps.stripe : {};
  return { ...md, apps: { ...apps, stripe: { ...stripe, price: cents } } };
}

/* Whether we may touch this event at all, and why not if we may not.
   Refusing loudly beats writing a price onto a class never set up to charge. */
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
     it is neither, someone changed it in the dashboard and the site no longer
     describes reality — which is precisely when overwriting it would destroy
     the real number. Stop and say so. */
  const allowed = [dollarsToCents(plan.listPrice, currency)];
  if (plan.salePrice) allowed.push(dollarsToCents(plan.salePrice, currency));

  if (!allowed.includes(current)) {
    return {
      ok: false,
      reason: `Cal.com says $${centsToDollars(current)}, but the site says $${plan.listPrice}` +
              (plan.salePrice ? ` (sale $${plan.salePrice})` : "") +
              `. One of them is wrong — settle that before running this.`,
    };
  }

  const target = dollarsToCents(plan.target, currency);
  return { ok: true, currency, current, target, changed: current !== target };
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

/* -------------------------------------------------------------------- main */

export function parseArgs(argv) {
  const has = (f) => argv.includes(f);
  const only = (argv.find((a) => a.startsWith("--only=")) || "").slice(7);
  return {
    mode: has("--list") ? "list" : has("--sale") ? "sale" : null,
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
    console.error(
      "CAL_API_KEY is not set.\n" +
      "It is a secret: put it in your shell (export CAL_API_KEY=...) or in GitHub Actions.\n" +
      "Never in the repo — this one is public."
    );
    process.exitCode = 1;
    return;
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { classes, config } = readSite(root);
  const plans = planFor(classes, config, mode, only);
  const onSale = ((config && config.SALE && config.SALE.CLASSES) || []).length;

  if (!plans.length) {
    console.log(
      mode === "sale"
        ? "The SALE list in config.js is empty, so no class is on sale — nothing to set."
        : "No sellable class found in classes.js — nothing to put back."
    );
    return;
  }

  const all = await calGet("/event-types", key);
  const events = all.event_types || all.eventTypes || [];
  const bySlug = new Map(events.map((e) => [e.slug, e]));

  console.log(
    `\n${apply ? "Setting" : "DRY RUN — would set"} ` +
    `${mode === "sale" ? `SALE prices (${config.SALE.PERCENT_OFF}% off, ${onSale} class${onSale === 1 ? "" : "es"})` : "LIST prices"}\n`
  );

  let changed = 0, already = 0, blocked = 0;

  for (const plan of plans) {
    const verdict = checkEvent(bySlug.get(plan.slug), plan);

    if (!verdict.ok) {
      console.log(`  ✗ ${plan.slug.padEnd(20)} ${verdict.reason}`);
      blocked++;
      continue;
    }
    if (!verdict.changed) {
      console.log(`  · ${plan.slug.padEnd(20)} already $${centsToDollars(verdict.target)}`);
      already++;
      continue;
    }

    const line = `${plan.slug.padEnd(20)} $${centsToDollars(verdict.current)} → $${centsToDollars(verdict.target)}`;
    if (!apply) {
      console.log(`  → ${line}`);
      changed++;
      continue;
    }

    await calPatch(`/event-types/${bySlug.get(plan.slug).id}`, key, {
      metadata: mergeStripePrice(bySlug.get(plan.slug).metadata, verdict.target),
    });
    console.log(`  ✓ ${line}`);
    changed++;
  }

  console.log(`\n${changed} ${apply ? "changed" : "to change"}, ${already} already right, ${blocked} refused.`);
  if (blocked) console.log("Anything refused above needs a person — the script will not guess at a price.");
  if (!apply && changed) console.log("Nothing was written. Re-run with --apply to make it real.");
  if (apply && mode === "sale") console.log("Cal.com now charges the sale price. FALL25-SALE.md has the way back out.");
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("set-sale-prices.mjs");
if (invokedDirectly) {
  run().catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    process.exitCode = 1;
  });
}
