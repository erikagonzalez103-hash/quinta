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
  LAUNCH_NOTE: "Launching soon"
};
