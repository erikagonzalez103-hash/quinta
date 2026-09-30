/* Shared by choose.html and gift.html - the two pages that take money on
   Stripe. Three small things both need, kept in one place so they cannot
   drift apart:

     QuintaShop.dated(slugs)  -> Promise of { slug: "2026-10-27", ... }
     QuintaShop.ref()         -> the referring teacher's code, or ""
     QuintaShop.money(cents)  -> "$150" or "$112.50"

   No build step, no dependencies. Loaded with a plain <script> tag. */
(function () {
  "use strict";

  /* WHICH CLASSES HAVE A DATE SHE COULD BOOK

     Asked of Cal.com's public availability endpoint - the same one the
     booking page itself calls. It needs no key and allows any website to ask,
     so this is the live truth about what is bookable, not what somebody
     meant to schedule.

     It asks about each class's $0 REDEEM twin, because that is the door she
     walks through after paying. A class whose twin has no dates cannot be
     taken, whatever its class page says.

     Resolves to { slug: firstDateISO } for classes that have one. If Cal.com
     cannot be reached at all it resolves to null, and the caller shows every
     class rather than an empty page - the checkout function makes the same
     call and refuses undated classes itself, so failing open here cannot
     sell one. */
  function dated(slugs) {
    var today = new Date();
    var end = new Date(today.getTime() + 150 * 86400000);
    function iso(d) { return d.toISOString().slice(0, 10); }

    var anyAnswered = false;
    return Promise.all(slugs.map(function (slug) {
      var url = "https://api.cal.com/v2/slots?eventTypeSlug=" +
        encodeURIComponent(slug + "-redeem") + "&username=quintaandco" +
        "&start=" + iso(today) + "&end=" + iso(end);
      return fetch(url, { headers: { "cal-api-version": "2024-09-04" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return null;
          anyAnswered = true;
          var days = Object.keys((d && d.data) || {}).sort();
          return days.length ? [slug, days[0]] : null;
        })
        .catch(function () { return null; });
    })).then(function (pairs) {
      if (!anyAnswered) return null;
      var out = {};
      pairs.forEach(function (p) { if (p) out[p[0]] = p[1]; });
      return out;
    });
  }

  /* WHO SENT HER

     app.js stores the code in localStorage the first time she lands on a
     ?ref= link, and keeps it 60 days. These pages do not load app.js, so read
     the same key the same way - URL first, in case she arrived here directly
     on a faculty link and nothing has stored it yet. */
  function ref() {
    function clean(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24); }
    try {
      var fromUrl = clean(new URLSearchParams(location.search).get("ref"));
      if (fromUrl) {
        try { localStorage.setItem("quinta_ref", JSON.stringify({ code: fromUrl, at: Date.now() })); } catch (e) {}
        return fromUrl;
      }
      var s = JSON.parse(localStorage.getItem("quinta_ref") || "null");
      if (s && s.code && Date.now() - s.at < 60 * 24 * 60 * 60 * 1000) return clean(s.code);
    } catch (e) { /* private browsing - attribution is best-effort */ }
    return "";
  }

  /* MONEY, TO THE CENT

     Every price is worked out in cents and rounded exactly once, the same
     way the checkout function rounds it, then shown with pennies only when
     there are some. Rounding dollars on the page while the function rounded
     cents is how "$113" on screen became $112.50 at Stripe. */
  function money(cents) {
    var c = Math.round(Number(cents) || 0);
    return "$" + (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
  }

  function prettyDay(iso) {
    try {
      var p = String(iso).split("-");
      return new Date(+p[0], +p[1] - 1, +p[2])
        .toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch (e) { return iso; }
  }

  window.QuintaShop = { dated: dated, ref: ref, money: money, prettyDay: prettyDay };
})();
