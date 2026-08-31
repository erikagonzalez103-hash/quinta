import {
  parseClasses, dollarsToCents, centsToDollars, planFor,
  mergeStripePrice, checkEvent, parseArgs,
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

const CLASSES = [
  { slug: 'entity-setup', name: 'Entity setup', price: 175, salePrice: 131, booking: 'https://cal.com/q/entity-setup' },
  { slug: 'brand-101',    name: 'Brand 101',    price: 175, booking: 'https://cal.com/q/brand-101' },
  { slug: 'coffee',       name: 'Coffee',       price: 0, free: true, salePrice: 5, booking: 'https://cal.com/q/coffee' },
  { slug: 'module-3',     name: 'Module 3',     price: 299, salePrice: 224, soon: true, booking: 'https://cal.com/q/module-3' },
  { slug: 'module-1',     name: 'Module 1',     price: 150, salePrice: 112, booking: 'https://cal.com/q/module-1' },
];

console.log('\n2. The plan — a class nobody agreed to discount must never appear');
{
  const sale = planFor(CLASSES, 'sale');
  const slugs = sale.map((p) => p.slug);
  check('only classes carrying a salePrice', slugs.join() === 'entity-setup,module-1', slugs.join());
  check("another teacher's class is untouched", !slugs.includes('brand-101'));
  check('a free class is never discounted', !slugs.includes('coffee'));
  check('a class with no dates is not sold', !slugs.includes('module-3'));
  check('sale mode targets the sale price', sale[0].target === 131, String(sale[0].target));

  const list = planFor(CLASSES, 'list');
  check('list mode targets the list price', list[0].target === 175, String(list[0].target));
  check('list mode covers the same classes', list.length === sale.length);

  const one = planFor(CLASSES, 'sale', ['module-1']);
  check('--only narrows it', one.length === 1 && one[0].slug === 'module-1');
}

console.log('\n3. Metadata — a PATCH must not delete another app');
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

console.log('\n4. Refusing to guess');
{
  check('no such event', checkEvent(null, PLAN).ok === false);
  check('Stripe never set up → refuses rather than making a class paid',
    checkEvent(ev(null), PLAN).ok === false);
  check('Stripe switched off → refuses',
    checkEvent(ev({ price: 17500, currency: 'usd', enabled: false }), PLAN).ok === false);
  check('a currency it does not know → refuses',
    checkEvent(ev({ price: 17500, currency: 'eur', enabled: true }), PLAN).ok === false);

  /* The case classes.js warns about: a test price left behind in Cal.com.
     Overwriting it would destroy the only record that the two disagree. */
  const drifted = checkEvent(ev({ price: 9900, currency: 'usd', enabled: true }), PLAN);
  check('a price matching neither list nor sale → refuses', drifted.ok === false);
  check('and says both numbers so it can be settled', /175/.test(drifted.reason) && /131/.test(drifted.reason), drifted.reason);
}

console.log('\n5. Doing the work');
{
  const fromList = checkEvent(ev({ price: 17500, currency: 'usd', enabled: true }), PLAN);
  check('list price → sale price is a change', fromList.ok && fromList.changed);
  check('and it targets 13100 cents', fromList.target === 13100, String(fromList.target));

  const already = checkEvent(ev({ price: 13100, currency: 'usd', enabled: true }), PLAN);
  check('already on sale → no change, no error', already.ok && !already.changed);

  const back = checkEvent(ev({ price: 13100, currency: 'usd', enabled: true }), { ...PLAN, target: 175 });
  check('sale price → list price is a change', back.ok && back.changed && back.target === 17500);

  check('enabled left unset is treated as on',
    checkEvent(ev({ price: 17500, currency: 'usd' }), PLAN).ok === true);
}

console.log('\n6. Arguments — it must not write unless told to');
{
  check('dry run by default', parseArgs(['--sale']).apply === false);
  check('--apply turns writing on', parseArgs(['--sale', '--apply']).apply === true);
  check('--sale', parseArgs(['--sale']).mode === 'sale');
  check('--list', parseArgs(['--list']).mode === 'list');
  check('no mode is not a mode', parseArgs([]).mode === null);
  check('--only splits', parseArgs(['--sale', '--only=a,b']).only.join() === 'a,b');
  check('no --only means all', parseArgs(['--sale']).only === null);
}

console.log('\n7. It reads the real classes.js');
{
  const src = (await import('node:fs')).readFileSync(new URL('../classes.js', import.meta.url), 'utf8');
  const real = parseClasses(src);
  check('parses', Array.isArray(real) && real.length > 0, String(real.length));
  const sale = planFor(real, 'sale');
  check('every sale price is really 25% off, rounded down',
    sale.every((p) => p.salePrice === Math.floor(p.listPrice * 0.75)),
    sale.map((p) => `${p.slug} ${p.listPrice}->${p.salePrice}`).join(' '));
  check('nothing on sale is free or dateless',
    sale.every((p) => p.listPrice > 0 && p.salePrice < p.listPrice));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
