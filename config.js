/* ============================================================
   Quinta & Co. — site config

   SITE_LIVE controls whether the public sees the full site.
     true  → everyone sees the site (current setting)
     false → visitors see a simple "launching soon" screen,
             EXCEPT anyone who adds ?preview to the URL, who
             always sees the full site (handy for sharing a
             sneak peek before launch).

   You chose "full site visible immediately," so this is set to
   true. To hide the site again before a future launch, change
   true to false below and save.
   ============================================================ */

window.QUINTA_CONFIG = {
  SITE_LIVE: true,

  // When false, every Foundations class shows "Coming this fall" instead of a
  // Book button — the full curriculum is visible, but not yet open to enroll.
  // Flip to true when the Foundations open. (To open one class early before
  // then, add `open: true` to that class in classes.js.)
  FOUNDATIONS_OPEN: false,

  // Shown on the "launching soon" screen when SITE_LIVE is false.
  LAUNCH_NOTE: "Launching soon",

  /* ---------- THE FALL FLASH SALE ----------

     THE DISCOUNT LIVES ON A SEPARATE, HIDDEN CAL.COM EVENT — not on your real
     one. Your real event keeps its full price, so someone who finds you on
     Google during the sale still pays full. Only people who arrive with a
     code, through /fall25/, are sent to the discounted twin.

     This is the same shape as the HERHOUSE code: module-1-herhouse was a
     second event at a lower price, reached from a page, never a code anyone
     typed. Cal.com has no per-customer pricing — one event, one price — so a
     second event is the only way to charge two different people differently.

     WHAT EACH LINE MEANS
       "real-slug": "twin-slug"
     The class on the left keeps its full price everywhere on the site. The
     event on the right is the hidden one that charges the sale price, and it
     is what /fall25/ links to.

     TO ADD A CLASS TO THE SALE
       1. In Cal.com, duplicate the real event. Name the copy <slug>-fall25.
       2. Set its Stripe price to the sale figure (25% off, rounded DOWN).
       3. HIDE it, so it never shows on your public Cal.com profile.
       4. Give it dates. See the warning below — this is the step that gets
          forgotten and it is the one that strands customers.
       5. Add the pair here.

     TO END THE SALE
       Empty CLASSES to {} — /fall25/ empties itself. Then hide or delete the
       twins in Cal.com. Your real events were never touched, so there is no
       price to put back and no way to be left quietly undercharging.

     ⚠ THE TWINS DO NOT GET DATES AUTOMATICALLY.
     The schedule-sync Worker finds Cal.com events by exact slug, so it syncs
     "certification" and knows nothing about "certification-fall25". Dates you
     set in the faculty portal reach the real event ONLY. Every twin's dates
     are set by hand in Cal.com and will drift as new dates are added.
     Before sending a code out, open each twin's link and check it shows the
     sale price AND offers dates. A sale link with no bookable slot strands
     exactly the people your code brought.                                   */
  SALE: {
    PERCENT_OFF: 25,

    /* Last day of the sale, Dallas time — midnight at the END of this date.
       September is CDT (UTC-5), so this is 2026-10-01T00:00:00-05:00.
       /fall25/ empties itself once it passes, so a forgotten sale stops
       advertising on its own.

       BUT THE PAGE EXPIRING IS NOT THE SALE ENDING. The twin events in
       Cal.com stay bookable to anyone holding a direct link until you hide
       them there. The page is the shop window; Cal.com is the till. */
    ENDS: "2026-09-28",

    /* WHAT THE CODE IS GOOD FOR — shown on /fall25/ and echoed in terms.html.
       ENDS is the last day to BOOK; this is which class dates are eligible.
       They are different promises and both have to be true.

       ⚠ THIS LINE DOES NOT ENFORCE ITSELF. What actually stops someone
       booking an October class at the sale price is the twin event's
       availability in Cal.com. Cap each twin's dates at 30 September or the
       page makes a promise the checkout will not keep. */
    ELIGIBLE: "September 2026 class dates only",

    /* Faculty who have a /go/<name>fall25/ short link built, so the portal
       can hand them something to paste. A name added here WITHOUT creating
       the matching go/<name>fall25/ folder gives that teacher a dead link —
       check the folder exists before adding a name. */
    CODES: ["erika", "stephanie", "nery", "joshlyn", "nik", "tara"],

    /* ENDED 28 September 2026, two days early. Emptying this is what stops
       /fall25/ advertising - the page reads CLASSES and empties itself.

       Why early: the sale's own promise was "September 2026 class dates only"
       and not one September date remained on any of the three. Certification
       and Module 2 had no dates at all; Module 1 had a single 13 October slot,
       which the sale could not honour. The offer had nothing left to sell.

       All six promo twins were DELETED in Cal.com the same day - the three
       above plus entity-setup-fall25, module-1-herhouse and
       module-1-herhouse-duo. Every one had zero bookings, so nothing was lost.

       THE LESSON, because it will happen again: a twin made by duplicating
       INHERITS the original's scheduleId, and availability lives on the
       schedule. So a twin shows every date its real class ever gets, forever.
       The old instruction here - "cap each twin's dates at 30 September" - was
       impossible: capping the twin caps the real class, because they read the
       same calendar. On 28 September that left Module 1's October date
       bookable at $112, $112.50 and $75 through three long-dead promo links.

       So: a LIVE promo twin should share the schedule (build-to-last-fff does,
       deliberately - it means Get Certified's dates reach the bundle with no
       second set to maintain). An ENDED one must be deleted, or given its own
       empty schedule. Leaving it hidden is not enough; hidden only removes it
       from the public profile, and a direct link still books. */
    CLASSES: {}
  }
};
