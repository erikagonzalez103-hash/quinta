import { readFileSync } from 'node:fs';
import {
  parseClasses, parseConfig, dollarsToCents, centsToDollars, discounted,
  planFor, mergeStripePrice, checkEvent, parseArgs,
} from './set-sale-prices.mjs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${d}`); } };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('\n1. Money — the factor-of-100 mistake that charges $1.31 for a $131 class');
{
  check('dollars become cents', dollarsToCents(131) === 13100, String(dollarsToCents(131)));
  check('$74 is 7400', dollarsToCents(74) === 7400);
  check('refuses a currency it has not been taught', threw(() => dollarsToCents(131, 'jpy')));
  check('refuses a free price', threw(() => dollarsToCents(0)));
  check('refuses nonsense', threw(() => dollarsToCents(undefined)));
  check('cents come back as dollars', centsToDollars(13100) === '131', centsToDollars(13100));
  check('keeps real cents when there are any', centsToDollars(11250) === '112.50', centsToDollars(11250));
}

console.log('\n2. The discount — rounded down, never up');
{
  check('$175 → $131', discounted(175, 25) === 131, String(discounted(175, 25)));
  check('$99 → $74', discounted(99, 25) === 74);
  check('$299 → $224', discounted(299, 25) === 224);
  check('$200 → $150 exactly', discounted(200, 25) === 150);
  check('never rounds up', discounted(175, 25) < 175 * 0.75 + 1);
  check('no discount is not a discount', discounted(175, 0) === null);
  check('100% off is refused', discounted(175, 100) === null);
  check('a free class has nothing to discount', discounted(0, 25) === null);
  check('a $1 class cannot be discounted to nothing', discounted(1, 25) === null, String(discounted(1, 25)));
}

const CLASSES = [
  { slug: 'entity-setup', name: 'Entity setup', price: 175, booking: 'x' },
  { slug: 'brand-101',    name: 'Brand 101',    price: 175, booking: 'x' },
  { slug: 'coffee',       name: 'Coffee',       price: 0, free: true, booking: 'x' },
  { slug: 'module-3',     name: 'Module 3',     price: 299, soon: true, booking: 'x' },
  { slug: 'no-link',      name: 'Not bookable', price: 199 },
];
const CONFIG = { SALE: { PERCENT_OFF: 25, CLASSES: ['entity-setup'] } };

console.log('\n3. The sale list — a class nobody agreed to discount must never appear');
{
  const sale = planFor(CLASSES, CONFIG, 'sale');
  const slugs = sale.map((p) => p.slug);
  check('only classes named in config', slugs.join() === 'entity-setup', slugs.join());
  check("another teacher's class is untouched", !slugs.includes('brand-101'));
  check('a free class is never discounted', !slugs.includes('coffee'));
  check('a class with no dates is never discounted', !slugs.includes('module-3'));
  check('a class with no booking link is skipped', !slugs.includes('no-link'));
  check('targets the worked-out sale price', sale[0].target === 131, String(sale[0].target));

  const empty = planFor(CLASSES, { SALE: { PERCENT_OFF: 25, CLASSES: [] } }, 'sale');
  check('an empty list means no sale at all', empty.length === 0);

  const one = planFor(CLASSES, { SALE: { PERCENT_OFF: 25, CLASSES: ['entity-setup', 'brand-101'] } }, 'sale', ['brand-101']);
  check('--only narrows it further', one.length === 1 && one[0].slug === 'brand-101');
}

console.log('\n4. Putting prices back must not depend on the sale list');
{
  /* The trap this design removes: the natural way to end a sale is to empty
     config.SALE.CLASSES. If --list only covered classes still in that list,
     doing so would strand Cal.com on sale prices with nothing left to fix it. */
  const back = planFor(CLASSES, { SALE: { PERCENT_OFF: 25, CLASSES: [] } }, 'list');
  const slugs = back.map((p) => p.slug);
  check('--list covers every sellable class even with an empty sale list',
    slugs.join() === 'entity-setup,brand-101', slugs.join());
  check('and targets the list price', back[0].target === 175, String(back[0].target));
  check('it still knows what a sale price would look like', back[0].salePrice === 131, String(back[0].salePrice));
  check('free and dateless classes stay out of it',
    !slugs.includes('coffee') && !slugs.includes('module-3'));
}

console.log('\n5. Metadata — a PATCH must not delete another app');
{
  const before = {
    apps: { stripe: { price: 17500, currency: 'usd', enabled: true, paymentOption: 'ON_BOOKING' },
            giphy: { thankYouPage: 'x' } },
    somethingElse: true,
  };
  const after = mergeStripePrice(before, 13100);
  check('price is replaced', after.apps.stripe.price === 13100);
  check('currency survives', after.apps.stripe.currency === 'usd');
  check('paymentOption survives', after.apps.stripe.paymentOption === 'ON_BOOKING');
  check('another app survives', after.apps.giphy.thankYouPage === 'x');
  check('unrelated metadata survives', after.somethingElse === true);
  check('the original is not mutated', before.apps.stripe.price === 17500);
  check('copes with no metadata at all', mergeStripePrice(undefined, 13100).apps.stripe.price === 13100);
}

const PLAN = { slug: 'entity-setup', listPrice: 175, salePrice: 131, target: 131 };
const ev = (stripe) => ({ id: 1, slug: 'entity-setup', metadata: stripe ? { apps: { stripe } } : {} });

console.log('\n6. Refusing to guess');
{
  check('no such event', checkEvent(null, PLAN).ok === false);
  check('Stripe never set up → refuses rather than making a class paid',
    checkEvent(ev(null), PLAN).ok === false);
  check('Stripe switched off → refuses',
    checkEvent(ev({ price: 17500, currency: 'usd', enabled: false }), PLAN).ok === false);
  check('a currency it does not know → refuses',
    checkEvent(ev({ price: 17500, currency: 'eur', enabled: true }), PLAN).ok === false);

  const drifted = checkEvent(ev({ price: 9900, currency: 'usd', enabled: true }), PLAN);
  check('a price matching neither list nor sale → refuses', drifted.ok === false);
  check('and says both numbers so it can be settled',
    /175/.test(drifted.reason) && /131/.test(drifted.reason), drifted.reason);
}

console.log('\n7. Doing the work');
{
  const on = checkEvent(ev({ price: 17500, currency: 'usd', enabled: true }), PLAN);
  check('list price → sale price is a change', on.ok && on.changed);
  check('and it targets 13100 cents', on.target === 13100, String(on.target));

  const already = checkEvent(ev({ price: 13100, currency: 'usd', enabled: true }), PLAN);
  check('already on sale → no change, no error', already.ok && !already.changed);

  /* Taking a teacher back off: the class has left the sale list, but Cal.com
     is still sitting at the discounted figure and must be recognised. */
  const off = checkEvent(ev({ price: 13100, currency: 'usd', enabled: true }),
                         { ...PLAN, target: 175 });
  check('sale price → list price is a change', off.ok && off.changed && off.target === 17500);

  check('enabled left unset is treated as on',
    checkEvent(ev({ price: 17500, currency: 'usd' }), PLAN).ok === true);
}

console.log('\n8. Arguments — it must not write unless told to');
{
  check('dry run by default', parseArgs(['--sale']).apply === false);
  check('--apply turns writing on', parseArgs(['--sale', '--apply']).apply === true);
  check('--sale', parseArgs(['--sale']).mode === 'sale');
  check('--list', parseArgs(['--list']).mode === 'list');
  check('no mode is not a mode', parseArgs([]).mode === null);
  check('--only splits', parseArgs(['--sale', '--only=a,b']).only.join() === 'a,b');
  check('no --only means all', parseArgs(['--sale']).only === null);
}

console.log('\n9. The real site');
{
  const here = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const classes = parseClasses(here('classes.js'));
  const config = parseConfig(here('config.js'));

  check('classes.js parses', Array.isArray(classes) && classes.length > 0, String(classes.length));
  check('config.js parses and has a SALE block', Boolean(config && config.SALE));
  check('the discount is 25%', config.SALE.PERCENT_OFF === 25);

  /* Every slug in the sale list must be a real, sellable class — a typo here
     would silently discount nothing and nobody would notice until the numbers
     came in wrong. */
  const bySlug = new Map(classes.map((c) => [c.slug, c]));
  const unknown = config.SALE.CLASSES.filter((s) => !bySlug.has(s));
  check('every slug in the sale list is a real class', unknown.length === 0, unknown.join());
  const unsellable = config.SALE.CLASSES.filter((s) => {
    const c = bySlug.get(s);
    return !c || !c.booking || c.free || c.soon;
  });
  check('every class on sale can actually be booked', unsellable.length === 0, unsellable.join());

  const sale = planFor(classes, config, 'sale');
  check('the sale is not empty', sale.length > 0, String(sale.length));
  check('every sale price is 25% off, rounded down',
    sale.every((p) => p.target === Math.floor(p.listPrice * 0.75)),
    sale.map((p) => `${p.slug} ${p.listPrice}->${p.target}`).join(' '));
  console.log(`      on sale: ${sale.map((p) => `${p.slug} $${p.listPrice}→$${p.target}`).join(', ')}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
