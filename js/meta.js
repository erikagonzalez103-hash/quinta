/* ============================================================
   META (Facebook) PIXEL EVENTS for paid social.

   Meta's pixel already loads on every page for PageView. This file adds
   the two events a Sales campaign optimizes on:

   InitiateCheckout - on the last click before payment:
     - any link into a paid Cal.com event (class pages, bundle buttons).
       Caught here for the whole page, so a new button needs no wiring.
     - "Continue to payment" on oct21.html / choose.html / gift.html,
       which call QuintaMeta.checkout() just before going to Stripe.
       checkout() returns a Promise - AWAIT IT before redirecting to Stripe,
       or the event can be cancelled when the page unloads.

   Purchase - only where the buyer comes back to our own site:
     - oct21.html?booked=1&s=<session>  and  bundle/?b=custom|gift&s=<session>
       via QuintaMeta.purchased(sessionId). The value is what this browser
       saw at checkout (kept in sessionStorage), never a number from the URL.
     - Cal.com purchases never come back here (redirect-on-booking needs
       Cal.com's Teams plan), so those are sent from the server instead:
       supabase/functions/_shared/meta.ts. The server also sends every
       Stripe purchase, with the same id as the browser, so Meta counts
       each one once.

   VALUES are list prices from classes.js, and bundle prices from BUNDLES
   below (keep in step with fork-femme-foundations.html and
   _shared/meta.ts). A Choose-your-own or October 21 checkout uses the
   discounted total the page showed. Good enough to optimize on; the
   server's Purchase carries the exact amount Stripe took.

   Free bookings (Coffee, the $0 "-redeem" links) never fire either event.
   Referral (?ref=) handling is untouched - this file only reads links.

   v3 (Oct 2026): InitiateCheckout was being dropped when the page left
   for Cal.com / Stripe before the pixel finished sending (seen in Test
   events: button click logged, checkout not). Fixes:
     - SEND_WAIT raised from 150ms to 500ms before leaving the page.
     - QuintaMeta.checkout() now returns a Promise that resolves after
       SEND_WAIT, so Stripe pages can wait for it.
     - Every InitiateCheckout carries an eventID (also exposed as
       QuintaMeta.lastCheckoutId) so a server-side copy can be deduplicated.
   ============================================================ */
(function () {
  "use strict";

  var SEND_WAIT = 500;                     // ms to let the pixel send before the page unloads

  var BUNDLES = {
    "get-started-fff":    { name: "Get started (bundle)",    value: 212 },
    "keep-the-books-fff": { name: "Keep the books (bundle)", value: 168 },
    "build-to-last-fff":  { name: "Build to last (bundle)",  value: 990 },
    "the-practice-fff":   { name: "The Practice (bundle)",   value: 485 }
  };
  var PENDING = "quinta_meta_pending";     // sessionStorage: what she was about to pay for
  var FIRED = "quinta_meta_purchased";     // localStorage: Purchase ids already sent
  var UTM = "quinta_utm";                  // localStorage: the ad tags she last arrived with

  /* WHICH AD SENT HER. The utm_* tags on the link she arrived by (the Meta
     campaign uses ?utm_source=meta&utm_medium=paid&utm_campaign=fff-250k)
     are kept for 30 days - the most recent tagged arrival wins - and travel
     with her purchase: into Stripe's checkout metadata (QuintaMeta.utm(), sent
     by oct21 / choose / gift) and onto Cal.com booking links (added on click
     below, and Cal.com records them on the booking). The booking functions
     write them to the enrollments ledger (utm_source ... utm_content).
     Separate from ?ref=, which credits a teacher and is untouched here. */
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  function cleanTag(v) { return String(v || "").replace(/[^A-Za-z0-9 ._\-+:/]/g, "").slice(0, 100); }
  (function remember() {
    try {
      var q = new URLSearchParams(location.search);
      if (!q.get("utm_source")) return;
      var t = { at: Date.now() };
      UTM_KEYS.forEach(function (k) { var v = cleanTag(q.get(k)); if (v) t[k] = v; });
      localStorage.setItem(UTM, JSON.stringify(t));
    } catch (e) { /* private browsing - best effort */ }
  })();
  function utm() {
    try {
      var t = JSON.parse(localStorage.getItem(UTM) || "null");
      if (!t || !t.at || Date.now() - t.at > 30 * 24 * 60 * 60 * 1000) return {};
      var out = {}; UTM_KEYS.forEach(function (k) { if (t[k]) out[k] = t[k]; });
      return out;
    } catch (e) { return {}; }
  }
  function withUtm(href) {
    var tags = utm(), keys = Object.keys(tags);
    if (!keys.length) return href;
    try {
      var u = new URL(href);
      if (u.searchParams.get("utm_source")) return href;   // the link already says where it came from
      keys.forEach(function (k) { u.searchParams.set(k, tags[k]); });
      return u.href;
    } catch (e) { return href; }
  }

  function fire(name, data, opts) {
    try { if (typeof fbq === "function") fbq("track", name, data, opts || {}); } catch (e) {}
  }

  /* A unique id per checkout, so a browser + server copy of the same
     InitiateCheckout is counted once by Meta. */
  function newEventId() {
    try { if (window.crypto && crypto.randomUUID) return "ic_" + crypto.randomUUID(); } catch (e) {}
    return "ic_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function priceOf(slug) {
    if (BUNDLES[slug]) return BUNDLES[slug];
    var all = (typeof QUINTA_CLASSES !== "undefined" && QUINTA_CLASSES) || [];
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (c && c.slug === slug) return c.free || !(Number(c.price) > 0) ? null : { name: c.name, value: Number(c.price) };
    }
    return null;
  }

  function cookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  /* ---------- Cal.com links, anywhere on the page ---------- */
  function calSlug(href) {
    var m = /^https:\/\/cal\.com\/quintaandco\/([a-z0-9-]+)/i.exec(href || "");
    return m ? m[1].toLowerCase() : "";
  }
  var leaving = false;                     // ignore double-clicks while we wait to leave
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a) return;
    var slug = calSlug(a.href);
    if (!slug || /-redeem$/.test(slug)) return;
    var p = priceOf(slug);
    if (!p) return;
    if (leaving) { ev.preventDefault(); return; }
    var eventId = newEventId();
    window.QuintaMeta && (window.QuintaMeta.lastCheckoutId = eventId);
    fire("InitiateCheckout",
         { content_name: p.name, content_ids: [slug], content_type: "product", value: p.value, currency: "USD" },
         { eventID: eventId });
    // The ad tags ride along to Cal.com, which records them on the booking.
    a.href = withUtm(a.href);
    /* Give the pixel time to send before the page is gone - unless the
       link opens a new tab, or another script already handled the click. */
    if (ev.defaultPrevented || a.target === "_blank" || ev.button !== 0 ||
        ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    leaving = true;
    var href = a.href;
    window.setTimeout(function () { window.location.href = href; }, SEND_WAIT);
    // If she comes back with the Back button, let the links work again.
    window.addEventListener("pageshow", function () { leaving = false; }, { once: true });
  });

  window.QuintaMeta = {
    lastCheckoutId: "",

    /* Stripe checkouts: call just before sending her to Stripe, and AWAIT
       the result before redirecting:
           await QuintaMeta.checkout(ids, total, name);
           location.href = stripeUrl;
       ids: slugs; value: the total the page quoted; name: what it is.
       Resolves with the eventID (pass it to the server if it also sends
       InitiateCheckout, so Meta dedupes the two). */
    checkout: function (ids, value, name) {
      var data = { content_name: name, content_ids: ids, content_type: "product",
                   num_items: ids.length, value: Math.round(Number(value) * 100) / 100, currency: "USD" };
      var eventId = newEventId();
      this.lastCheckoutId = eventId;
      fire("InitiateCheckout", data, { eventID: eventId });
      try { sessionStorage.setItem(PENDING, JSON.stringify(data)); } catch (e) {}
      return new Promise(function (resolve) {
        window.setTimeout(function () { resolve(eventId); }, SEND_WAIT);
      });
    },

    /* Back from Stripe with a session id: Purchase, once per session, under
       the id the server uses too. Nothing fires without a pending checkout
       from this same browser - the server's event covers that case. */
    purchased: function (sessionId) {
      if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return;
      var done = [];
      try { done = JSON.parse(localStorage.getItem(FIRED) || "[]"); } catch (e) {}
      if (done.indexOf(sessionId) !== -1) return;
      var data = null;
      try { data = JSON.parse(sessionStorage.getItem(PENDING) || "null"); } catch (e) {}
      if (!data || !(data.value > 0)) return;
      fire("Purchase", data, { eventID: sessionId });
      done.push(sessionId);
      try {
        localStorage.setItem(FIRED, JSON.stringify(done.slice(-50)));
        sessionStorage.removeItem(PENDING);
      } catch (e) {}
    },

    /* For the server's Purchase: Meta's own browser ids, to match the sale
       to the ad click. Sent with the checkout request. */
    ids: function () { return { fbp: cookie("_fbp"), fbc: cookie("_fbc") }; },

    /* The ad tags she arrived with (30 days), for the checkout request. */
    utm: utm,

    priceOf: priceOf
  };
})();
