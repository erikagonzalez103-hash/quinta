/* ============================================================
   Quinta & Co. — ICON LIBRARY (single source of truth)

   Draw each icon ONCE here, reuse everywhere. No more remaking
   the sprout (or anything else) per page.

   HOW TO USE on a page:
     1. Add this once, before </body>:   <script src="icons.js"></script>
        (use ../icons.js inside the /blog/ folder)
     2. Drop a placeholder wherever you want an icon:
            <span class="icon" data-icon="sprout"></span>
        It gets filled with the SVG automatically.
     3. Size & color it with CSS on the span — the SVGs use
        currentColor, so `color: var(--sage)` recolors them, and
        width/height on the span sizes them.

   IN JAVASCRIPT (e.g. app.js): quintaIcon("sprout") returns the markup.

   TO ADD AN ICON: add one entry below (keep the line-art, single-color,
   currentColor style so it matches the sprout family).
   ============================================================ */

window.QUINTA_ICONS = {

  /* The brand mark — delicate sprout (header, footer, flourishes) */
  "sprout":
    '<svg viewBox="0 0 18 13.5" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 8.5 V 13.5"/><path d="M9 8.5 C6.5 7.9 2.8 6 1 1.1 C4 0 7.8 2.9 9 8.5 Z"/><path d="M9 8.5 C11.5 7.9 15.2 6 17 1.1 C14 0 10.2 2.9 9 8.5 Z"/><circle cx="9" cy="3.5" r="0.8" fill="currentColor" stroke="none"/></svg>',

  /* The Foundations — sprout with roots (grounding) */
  "sprout-roots":
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 40 V20"/><path d="M32 24 C27 23 20 20 17 12 C24 10 30 16 32 24 Z"/><path d="M32 24 C37 23 44 20 47 12 C40 10 34 16 32 24 Z"/><circle cx="32" cy="16" r="1.4" fill="currentColor" stroke="none"/><path d="M14 40 H50"/><path d="M32 40 V53"/><path d="M32 41 C29 45 26 47.5 23 53"/><path d="M32 41 C35 45 38 47.5 41 53"/></svg>',

  /* The Practice — sprout reaching up with a spark (building) */
  "sprout-spark":
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 52 V28"/><path d="M32 34 C27 33 20 30 17 22 C24 20 30 26 32 34 Z"/><path d="M32 34 C37 33 44 30 47 22 C40 20 34 26 32 34 Z"/><path d="M32 28 V15"/><path d="M32 5 C32.7 9 33 9.3 37 10 C33 10.7 32.7 11 32 15 C31.3 11 31 10.7 27 10 C31 9.3 31.3 9 32 5 Z"/></svg>',

  /* How it works — 1: pick a class (stacked cards) */
  "pick":
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="14" width="24" height="30" rx="3"/><path d="M16 8 h22 a3 3 0 0 1 3 3 v26"/><path d="M16 25 h12 M16 32 h8"/></svg>',

  /* How it works — 2: book your seat (calendar) */
  "calendar":
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="12" width="32" height="28" rx="3"/><path d="M8 20 h32"/><path d="M16 8 v8 M32 8 v8"/><circle cx="24" cy="30" r="2.5" fill="currentColor" stroke="none"/></svg>',

  /* How it works — 3: walk out with a tool (check) */
  "check":
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="32" height="32" rx="5"/><path d="M16 24 l6 6 l11 -13"/></svg>',

  /* Foundations phases — small marks (hub page) */
  "phase-start":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21 V11"/><path d="M12 12 C9 11 5 9 4 4 C8 4 11 7 12 12 Z"/><path d="M12 12 C15 11 19 9 20 4 C16 4 13 7 12 12 Z"/></svg>',
  "phase-books":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4 h11 a1 1 0 0 1 1 1 v15 H8 a2 2 0 0 1 -2 -2 Z"/><path d="M6 18 a2 2 0 0 1 2 -2 h10"/><path d="M9 8 h6 M9 11 h6"/></svg>',
  "phase-build":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><rect x="8.5" y="4.5" width="7" height="7" rx="1"/></svg>',

  /* Growth-stage foliage — reusable brand motif (business stages = stages of growth).
     Single-color line art (currentColor); pair with the moss plate for visibility on cream. */
  "growth-sprout":
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 40 V24"/><path d="M24 30 C18.5 28.5 13.5 24 12.5 16.5 C20 17.5 24.5 23 24 30 Z"/><path d="M24 30 C29.5 28.5 34.5 24 35.5 16.5 C28 17.5 23.5 23 24 30 Z"/></svg>',
  "growth-leafing":
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 42 V11"/><path d="M24 32 C18.5 31 14 27 13 20 C20 21 24.5 26 24 32 Z"/><path d="M24 26 C29.5 25 34 21 35 14 C28 15 23.5 20 24 26 Z"/><path d="M24 20 C19.5 19 16 16 15 10 C20.5 11 24 15 24 20 Z"/></svg>',
  "growth-bloom":
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 42 V16"/><path d="M24 32 C18.5 31 14 27 13 20 C20 21 24.5 26 24 32 Z"/><path d="M24 28 C29.5 27 34 23 35 16 C28 17 23.5 22 24 28 Z"/><circle cx="24" cy="6" r="3"/><circle cx="19.2" cy="9.4" r="3"/><circle cx="21.1" cy="15.1" r="3"/><circle cx="26.9" cy="15.1" r="3"/><circle cx="28.8" cy="9.4" r="3"/><circle cx="24" cy="11" r="1.8" fill="currentColor" stroke="none"/></svg>',

  /* Utility — chevron (toggles, accordions) */
  "chevron":
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6 l4 4 4-4"/></svg>'
};

/* Get an icon's markup in JS (for app.js etc.) */
function quintaIcon(name){ return window.QUINTA_ICONS[name] || ""; }

/* Auto-fill <span data-icon="name"> placeholders on the page */
(function () {
  function render() {
    var nodes = document.querySelectorAll("[data-icon]");
    Array.prototype.forEach.call(nodes, function (el) {
      var svg = window.QUINTA_ICONS[el.getAttribute("data-icon")];
      if (svg) el.innerHTML = svg;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
