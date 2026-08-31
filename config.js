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

     ONE LIST. A class in it is on sale; a class not in it is at full price.
     Nothing else to edit — the sale price is worked out for you (25% off,
     rounded down to a whole dollar) so there is no arithmetic to get wrong
     and no second number to keep in step.

     TO TURN A TEACHER ON when she emails back — add her class's slug to the
     list, save, then run:

         node tools/set-sale-prices.mjs --sale --apply

     That second step is the one that actually changes what Cal.com charges.
     Without it the website advertises a discount Cal.com will not honour.

     TO TURN SOMEONE OFF — take the slug out, then run:

         node tools/set-sale-prices.mjs --list --apply

     TO END THE SALE ENTIRELY — empty the list to [] and run the same --list
     command. List prices in classes.js are never overwritten, so there is
     nothing to restore and nothing to look up.

     The slugs, and who teaches what:
       entity-setup ......... Erika          bookkeeping-2 ...... Tara
       certification ........ Erika          brand-101 .......... Stephanie
       module-1 ............. Erika          financial-planning . Joshlyn
       module-2 ............. Erika          legacy-planning .... Nik
                                             trademarks ......... Nik
                                             insurance .......... Nery
                                               (Nery needs dates set first —
                                                a discount on a class with no
                                                dates sells a seat that does
                                                not exist)                    */
  SALE: {
    PERCENT_OFF: 25,
    CLASSES: [
      "entity-setup",
      "certification",
      "module-1",
      "module-2"
    ]
  }
};
