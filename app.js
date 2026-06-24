/* ============================================================
   Quinta & Co. — rendering + launch gate

   Three jobs:
   1. Launch gate: if SITE_LIVE is false and the URL has no
      ?preview, show the "launching soon" screen instead.
   2. Build the class lists on the hub pages from classes.js.
   3. Build the class detail page from classes.js.

   You shouldn't need to edit this file to change content —
   edit classes.js for classes, config.js for the launch switch.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- 1. Launch gate ---------- */
  var cfg = window.QUINTA_CONFIG || { SITE_LIVE: true };
  var hasPreview = new URLSearchParams(window.location.search).has("preview");

  if (!cfg.SITE_LIVE && !hasPreview) {
    showHolding(cfg.LAUNCH_NOTE || "Launching soon");
    return; // stop here — don't render the real page
  }

  /* ---------- run renderers once the DOM is ready ---------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPage);
  } else {
    renderPage();
  }

  function renderPage() {
    var foundationsList = document.getElementById("foundations-list");
    if (foundationsList) renderFoundations(foundationsList);

    var practiceList = document.getElementById("practice-list");
    if (practiceList) renderPractice(practiceList);

    if (document.body.getAttribute("data-page") === "class") renderClassDetail();

    wireToggles();

    var y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
  }

  /* ---------- 2. Hub lists ---------- */

  // A single class row, rendered as a link to its detail page.
  function classRow(c) {
    var a = document.createElement("a");
    a.className = "cls";
    a.href = "class.html?c=" + encodeURIComponent(c.slug);

    var name = document.createElement("span");
    name.className = "cls-name";
    name.textContent = c.name;
    if (c.soon) {
      var tag = document.createElement("span");
      tag.className = "tag-soon";
      tag.textContent = "In development";
      name.appendChild(tag);
    }

    var desc = document.createElement("span");
    desc.className = "cls-desc";
    desc.textContent = c.desc;

    a.appendChild(name);
    a.appendChild(desc);
    return a;
  }

  // A compact row (name only) for the home-page track blocks.
  function classRowCompact(c) {
    var a = document.createElement("a");
    a.className = "cls-mini";
    a.href = "class.html?c=" + encodeURIComponent(c.slug);
    var name = document.createElement("span");
    name.className = "cls-mini-name";
    name.textContent = c.name;
    a.appendChild(name);
    if (c.soon) {
      var tag = document.createElement("span");
      tag.className = "tag-soon";
      tag.textContent = "In development";
      a.appendChild(tag);
    }
    return a;
  }

  // Line-art icons for the Foundations phases (hub page only).
  function phaseIcon(num) {
    var icons = {
      "01": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21 V11"/><path d="M12 12 C9 11 5 9 4 4 C8 4 11 7 12 12 Z"/><path d="M12 12 C15 11 19 9 20 4 C16 4 13 7 12 12 Z"/></svg>',
      "02": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4 h11 a1 1 0 0 1 1 1 v15 H8 a2 2 0 0 1 -2 -2 Z"/><path d="M6 18 a2 2 0 0 1 2 -2 h10"/><path d="M9 8 h6 M9 11 h6"/></svg>',
      "03": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><rect x="8.5" y="4.5" width="7" height="7" rx="1"/></svg>'
    };
    return icons[num] || "";
  }

  function renderFoundations(container) {
    container.textContent = "";
    var compact = container.dataset.compact === "true";
    var classes = quintaByTrack("foundations");

    // Group into phases, preserving first-seen order.
    var order = [];
    var groups = {};
    classes.forEach(function (c) {
      var key = c.phaseNum + "|" + c.phase;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(c);
    });

    order.forEach(function (key) {
      var parts = key.split("|");
      var phaseEl = document.createElement("div");
      phaseEl.className = compact ? "" : "phase";

      var label = document.createElement("p");
      label.className = compact ? "track-phase" : "phase-label";
      if (!compact) {
        var icon = document.createElement("span");
        icon.className = "phase-icon";
        icon.innerHTML = phaseIcon(parts[0]);
        label.appendChild(icon);
      }
      var pn = document.createElement("span");
      pn.className = "pn";
      pn.textContent = parts[0];
      label.appendChild(pn);
      label.appendChild(document.createTextNode(parts[1]));
      phaseEl.appendChild(label);

      groups[key].forEach(function (c) {
        phaseEl.appendChild(compact ? classRowCompact(c) : classRow(c));
      });
      container.appendChild(phaseEl);
    });
  }

  function renderPractice(container) {
    container.textContent = "";
    var compact = container.dataset.compact === "true";
    if (compact) {
      quintaByTrack("practice").forEach(function (c) { container.appendChild(classRowCompact(c)); });
      return;
    }
    var phaseEl = document.createElement("div");
    phaseEl.className = "phase";
    quintaByTrack("practice").forEach(function (c) { phaseEl.appendChild(classRow(c)); });
    container.appendChild(phaseEl);
  }

  // Open/close the home-page track dropdowns (they start open).
  function wireToggles() {
    var toggles = document.querySelectorAll(".track-toggle");
    Array.prototype.forEach.call(toggles, function (btn) {
      btn.addEventListener("click", function () {
        var block = btn.closest(".track-block");
        if (!block) return;
        var open = block.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ---------- 3. Class detail page ---------- */

  function renderClassDetail() {
    var slug = new URLSearchParams(window.location.search).get("c");
    var c = slug ? quintaBySlug(slug) : null;
    var mount = document.getElementById("class-detail");
    if (!mount) return;

    if (!c) {
      mount.innerHTML = "";
      var miss = document.createElement("div");
      miss.className = "detail";
      var h = document.createElement("h1");
      h.textContent = "Class not found";
      var p = document.createElement("p");
      p.className = "desc";
      var back = document.createElement("a");
      back.href = "index.html";
      back.textContent = "Back to the home page";
      p.appendChild(back);
      miss.appendChild(h); miss.appendChild(p);
      mount.appendChild(miss);
      return;
    }

    document.title = c.name + " — Quinta & Co.";

    // Breadcrumb back to the right hub
    var hubHref = c.track === "foundations" ? "foundations.html" : "practice.html";
    var hubName = c.track === "foundations" ? "The Foundations" : "The Practice";

    var crumb = document.createElement("nav");
    crumb.className = "crumb wrap";
    var crumbLink = document.createElement("a");
    crumbLink.href = hubHref;
    crumbLink.textContent = "← " + hubName;
    crumb.appendChild(crumbLink);

    var detail = document.createElement("section");
    detail.className = "detail wrap";

    // Track / phase label
    var label = document.createElement("p");
    label.className = "phase-label";
    label.textContent = c.phase ? (hubName + " · " + c.phase) : hubName;
    detail.appendChild(label);

    var h1 = document.createElement("h1");
    h1.textContent = c.name;
    detail.appendChild(h1);

    var desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = c.desc;
    detail.appendChild(desc);

    // Syllabus
    if (c.format) {
      var fmt = document.createElement("p");
      fmt.className = "syl-format";
      fmt.textContent = c.format;
      detail.appendChild(fmt);
    }
    if (c.covers && c.covers.length) {
      var coversLabel = document.createElement("p");
      coversLabel.className = "syl-label";
      coversLabel.textContent = "What we'll cover";
      detail.appendChild(coversLabel);
      var ul = document.createElement("ul");
      ul.className = "syl-list";
      c.covers.forEach(function (item) {
        var li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      });
      detail.appendChild(ul);
    }
    if (c.walkout) {
      var walkLabel = document.createElement("p");
      walkLabel.className = "syl-label";
      walkLabel.textContent = "What you'll walk out with";
      detail.appendChild(walkLabel);
      var walk = document.createElement("p");
      walk.className = "syl-walkout";
      walk.textContent = c.walkout;
      detail.appendChild(walk);
    }
    if (c.prereq) {
      var prereq = document.createElement("p");
      prereq.className = "syl-prereq";
      prereq.textContent = "Good to know — " + c.prereq;
      detail.appendChild(prereq);
    }

    // Booking area
    if (c.soon) {
      var soon = document.createElement("p");
      soon.className = "soon-note";
      soon.innerHTML = "This one's quietly in development. Drop a note at " +
        '<a href="mailto:hello@quintaand.co">hello@quintaand.co</a> to be the first to hear when it opens.';
      detail.appendChild(soon);
    } else if (c.booking) {
      var book = document.createElement("div");
      book.className = "book";
      var btn = document.createElement("a");
      btn.className = "btn btn-solid";
      btn.href = c.booking;
      btn.textContent = c.free ? "Save your seat" : "See dates & book";
      book.appendChild(btn);
      if (c.free) {
        var freeNote = document.createElement("span");
        freeNote.className = "free-note";
        freeNote.textContent = "Free";
        book.appendChild(freeNote);
      }
      detail.appendChild(book);
    }

    if (c.disclaimer) {
      var disc = document.createElement("p");
      disc.className = "class-disclaimer";
      disc.textContent = c.disclaimer;
      detail.appendChild(disc);
    }

    mount.innerHTML = "";
    mount.appendChild(crumb);
    mount.appendChild(detail);
  }

  /* ---------- launching-soon screen ---------- */
  function showHolding(note) {
    function build() {
      var el = document.createElement("div");
      el.className = "holding";
      el.innerHTML =
        '<span class="wordmark">Quinta &amp; Co.</span>' +
        '<h1>Practical business education for women founders.</h1>' +
        '<p>The doors aren\'t open just yet — but they will be soon.</p>' +
        '<p class="when">' + note + "</p>";
      document.body.innerHTML = "";
      document.body.appendChild(el);
    }
    if (document.body) build();
    else document.addEventListener("DOMContentLoaded", build);
  }
})();
