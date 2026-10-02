import { syncable, isBookable, decide, looksLikeAnOutage, rewriteClass, bumpText } from './sync-class-dates.mjs';

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || detail === undefined ? '' : '  — ' + detail}`);
  if (!ok) failed++;
}

const CLASSES = [
  { slug: 'module-1', track: 'practice', open: true, booking: 'https://cal.com/quintaandco/module-1' },
  { slug: 'module-3', track: 'practice', soon: true, booking: 'https://cal.com/quintaandco/module-3' },
  { slug: 'module-2', track: 'practice', booking: 'https://cal.com/quintaandco/module-2' },
  { slug: 'trademarks', track: 'foundations', open: false, booking: 'https://cal.com/quintaandco/trademarks' },
  { slug: 'coffee', free: true, booking: 'https://cal.com/quintaandco/coffee' },
  { slug: 'mystery', track: 'foundations' },
  { slug: 'entity-setup', track: 'foundations', hold: true, booking: 'https://cal.com/quintaandco/entity-setup' },
];

console.log('1. Which classes it is in charge of');
{
  const s = syncable(CLASSES).map((x) => x.slug);
  check('paid Cal.com classes are synced', s.includes('module-1') && s.includes('trademarks'));
  check('free Coffee is left alone', !s.includes('coffee'));
  check('a class with no booking link is left alone', !s.includes('mystery'));
  check('a class on HOLD is left alone even with a Cal.com link', !s.includes('entity-setup'));
}

console.log('2. Reading the current state the way the site does');
{
  check('open:true is bookable', isBookable(CLASSES[0], false));
  check('soon:true is not', !isBookable(CLASSES[1], false));
  check('an AI module with no flags counts as bookable', isBookable(CLASSES[2], false));
  check('a Foundations class with open:false is not, while Foundations are closed', !isBookable(CLASSES[3], false));
}

console.log('3. Deciding what to change');
{
  const items = syncable(CLASSES);
  const d = decide(items, { 'module-1': true, 'module-3': true, 'module-2': false, trademarks: null }, false);
  const by = Object.fromEntries(d.map((x) => [x.slug, x.to]));
  check('opens a waitlisted class that now has dates', by['module-3'] === true);
  check('closes a bookable class that lost its dates', by['module-2'] === false);
  check('leaves a class alone when it already matches', !('module-1' in by));
  check('leaves a class alone when its lookup FAILED', !('trademarks' in by));
}

console.log('4. The outage stop');
{
  const items = syncable(CLASSES);
  check('refuses when Cal.com says nothing has dates but the site has bookable classes',
    looksLikeAnOutage(items, { 'module-1': false, 'module-3': false, 'module-2': false, trademarks: false }, false));
  check('does not trip when at least one class has dates',
    !looksLikeAnOutage(items, { 'module-1': true, 'module-3': false, 'module-2': false, trademarks: false }, false));
}

console.log('5. Rewriting classes.js without disturbing anything else');
{
  const src = [
    'window.QUINTA_CLASSES = [',
    '  {',
    '    slug: "module-2", track: "practice", stage: "Up and running",',
    '    open: true,   // Opened 30 Sep: 11 Nov date in Cal.com. Explicit so the landing page and',
    '                  // Where You Are agree with the class page.',
    '    name: "Module 2",',
    '    price: 200,',
    '  },',
    '  {',
    '    slug: "module-3", track: "practice", stage: "Established",',
    '    soon: true,   // no dates set yet',
    '    name: "Module 3",',
    '  },',
    '];',
  ].join('\n');

  const a = rewriteClass(src, 'module-2', false);
  check('the old open line and its continued comment are gone',
    !a.includes('Opened 30 Sep') && !a.includes('Where You Are agree'));
  check('the closed line sets open:false AND soon:true',
    /slug: "module-2"[^\n]*\n\s+open: false, soon: true,/.test(a));
  check('the next class is untouched', a.includes('soon: true,   // no dates set yet'));
  check('names and prices survive', a.includes('name: "Module 2",') && a.includes('price: 200,'));

  const b = rewriteClass(src, 'module-3', true);
  check('opening replaces soon with open:true', /slug: "module-3"[^\n]*\n\s+open: true,/.test(b) && !b.includes('no dates set yet'));
  check('opening one class does not touch the one before it', b.includes('Opened 30 Sep'));

  let ok = true;
  try { new Function(b.replace('window.QUINTA_CLASSES', 'var x')); } catch { ok = false; }
  check('the result is still valid JavaScript', ok);

  let threw = false;
  try { rewriteClass(src, 'no-such-class', true); } catch { threw = true; }
  check('an unknown slug is refused, not silently skipped', threw);
}

console.log('6. Cache version');
{
  const v = 'classes.js?v=' + '11';
  check('bumps the number by one', bumpText(`<script src="../${v}"></script>`) === `<script src="../classes.js?v=${12}"></script>`);
  check('leaves a file without it alone', bumpText('<p>nothing here</p>') === null);
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
