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

  /* The brand sprout — drawn once here so every wordmark (header, footer,
     holding screen, any future page) carries it. Brand recognition first. */
  var SPROUT_SVG = '<svg class="sprout" viewBox="0 0 18 13.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.5" aria-hidden="true"><path d="M9 8.5 V 13.5"/><path d="M9 8.5 C6.5 7.9 2.8 6 1 1.1 C4 0 7.8 2.9 9 8.5 Z"/><path d="M9 8.5 C11.5 7.9 15.2 6 17 1.1 C14 0 10.2 2.9 9 8.5 Z"/><circle cx="9" cy="3.5" r="0.8" fill="currentColor" stroke="none"/></svg>';

  // Put the sprout in front of any wordmark that doesn't already have it.
  function decorateWordmarks() {
    var marks = document.querySelectorAll(".wordmark");
    Array.prototype.forEach.call(marks, function (m) {
      if (!m.querySelector("svg")) m.insertAdjacentHTML("afterbegin", SPROUT_SVG);
    });
  }

  // Wire the blog "Share" bar — builds share links from the post's canonical URL + title.
  function wireShare() {
    var box = document.querySelector(".post-share");
    if (!box) return;
    var canonical = document.querySelector('link[rel="canonical"]');
    var url = canonical ? canonical.href : window.location.href;
    var ogt = document.querySelector('meta[property="og:title"]');
    var title = ogt ? ogt.getAttribute("content") : document.title;
    var u = encodeURIComponent(url), t = encodeURIComponent(title);
    var links = {
      linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=" + u,
      x: "https://twitter.com/intent/tweet?url=" + u + "&text=" + t,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + u,
      email: "mailto:?subject=" + t + "&body=" + encodeURIComponent(title + "\n\n" + url)
    };
    Array.prototype.forEach.call(box.querySelectorAll("a[data-share]"), function (a) {
      var k = a.getAttribute("data-share");
      if (links[k]) {
        a.href = links[k];
        if (k !== "email") { a.target = "_blank"; a.rel = "noopener"; }
      }
    });
    var copy = box.querySelector(".share-copy");
    if (copy && navigator.clipboard) {
      copy.addEventListener("click", function () {
        navigator.clipboard.writeText(url).then(function () {
          var orig = copy.textContent;
          copy.textContent = "Copied!";
          copy.classList.add("is-copied");
          setTimeout(function () { copy.textContent = orig; copy.classList.remove("is-copied"); }, 1600);
        });
      });
    } else if (copy) {
      copy.style.display = "none";
    }
  }

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

    var carousel = document.getElementById("tcarousel");
    if (carousel) renderTestimonials(carousel);

    renderBlogTeasers();

    wireToggles();
    decorateWordmarks();
    wireShare();
    setupMobileNav();
    if (document.querySelector(".scroll-cue")) {
      window.addEventListener("scroll", function () {
        document.body.classList.toggle("scrolled", window.scrollY > 40);
      }, { passive: true });
    }

    // Footer disclaimer: start the second sentence ("For decisions…") on its own line.
    var disc = document.querySelector(".legal-disclaimer");
    if (disc) disc.innerHTML = disc.innerHTML.replace("advice. For decisions", "advice.<br>For decisions");

    var y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
  }

  // Mobile hamburger nav — the header markup is shared across every page, so we
  // inject the toggle here rather than editing 18 files. On phones the long Coffee
  // button is moved into the dropdown so it can't overflow the bar.
  function setupMobileNav() {
    var barRight = document.querySelector("header .bar .bar-right");
    var nav = barRight && barRight.querySelector("nav.top");
    if (!barRight || !nav) return;
    var btn = document.createElement("button");
    btn.className = "nav-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span></span><span></span><span></span>";
    barRight.insertBefore(btn, barRight.firstChild);
    var coffee = barRight.querySelector(".btn-coffee");
    if (coffee) {
      var c = coffee.cloneNode(true);
      c.className = "btn btn-solid nav-coffee";
      nav.appendChild(c);
    }
    function close() { document.body.classList.remove("nav-open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
    window.addEventListener("resize", function () { if (window.innerWidth >= 760) close(); });
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
    if (isSoon(c)) {
      var tag = document.createElement("span");
      tag.className = "tag-soon";
      tag.textContent = soonLabel(c);
      name.appendChild(tag);
    }
    if (c.stage) {
      var stg = document.createElement("span");
      stg.className = "stage-tag";
      stg.innerHTML = '<span class="stage-ico">' + stageIcon(c.stage) + "</span>" + escapeHtml(c.stage);
      name.appendChild(stg);
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
    if (isSoon(c)) {
      var tag = document.createElement("span");
      tag.className = "tag-soon";
      tag.textContent = soonLabel(c);
      a.appendChild(tag);
    }
    return a;
  }

  // Foundations phase icons — pulled from the shared icon library (icons.js).
  function phaseIcon(num) {
    var map = { "01": "phase-start", "02": "phase-books", "03": "phase-build" };
    return (typeof quintaIcon === "function" && map[num]) ? quintaIcon(map[num]) : "";
  }

  // Stage → growth icon (the journey motif, reused from the home page).
  function stageIcon(stage) {
    var map = { "Just starting": "growth-sprout", "Up and running": "growth-leafing", "Established": "growth-bloom" };
    return (typeof quintaIcon === "function" && map[stage]) ? quintaIcon(map[stage]) : "";
  }

  // Phase header → growth-icon plate (01 sprout · 02 leafing · 03 bloom progression).
  function phaseGrowth(num) {
    var map = { "01": "growth-sprout", "02": "growth-leafing", "03": "growth-bloom" };
    return (typeof quintaIcon === "function") ? quintaIcon(map[num] || "growth-sprout") : "";
  }

  // A small chip used for the stage tag (icon + label).
  function stageChip(stage) {
    if (!stage) return "";
    return '<span class="stage-tag"><span class="stage-ico">' + stageIcon(stage) + "</span>" + escapeHtml(stage) + "</span>";
  }

  // ---- Coming-soon helpers --------------------------------------------------
  // A class is "soon" if it's flagged soon, or it's a Foundations class and the
  // Foundations aren't open yet (config FOUNDATIONS_OPEN:false). A class with
  // `open:true` is always treated as open (early-open escape hatch).
  function foundationsOpen() {
    return !!(window.QUINTA_CONFIG && window.QUINTA_CONFIG.FOUNDATIONS_OPEN);
  }
  function isSoon(c) {
    if (c.open) return false;
    return !!c.soon || (c.track === "foundations" && !foundationsOpen());
  }
  function soonLabel(c) {
    return c.track === "foundations" ? "Coming this fall" : "Coming soon";
  }
  function soonNoteHTML(c) {
    var coffee = '<a href="index.html#coffee">Coffee with Quinta</a>';
    return c.track === "foundations"
      ? "The Foundations open this fall (2026). Be first to hear — and grab a free hour in the meantime — at " + coffee + "."
      : "Not open just yet. Be first to hear at " + coffee + ".";
  }

  // The stage filter bar (All + each stage that actually appears in this track).
  function buildStageFilter(classes) {
    var order = ["Just starting", "Up and running", "Established"];
    var present = order.filter(function (s) { return classes.some(function (c) { return c.stage === s; }); });
    var nav = document.createElement("nav");
    nav.className = "stage-filter";
    nav.setAttribute("aria-label", "Filter classes by stage");
    function chip(label, val, active) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "stage-chip" + (active ? " is-active" : "");
      b.setAttribute("data-stage", val);
      b.innerHTML = (val ? '<span class="chip-ico">' + stageIcon(val) + "</span>" : "") + escapeHtml(label);
      return b;
    }
    nav.appendChild(chip("All", "", true));
    present.forEach(function (s) { nav.appendChild(chip(s, s, false)); });
    return nav;
  }

  // Wire the filter: clicking a chip shows only matching items and hides empty phase groups.
  function wireStageFilter(container) {
    var chips = container.querySelectorAll(".stage-chip");
    var items = container.querySelectorAll(".acc, .pcard");
    Array.prototype.forEach.call(chips, function (chip) {
      chip.addEventListener("click", function () {
        var val = chip.getAttribute("data-stage");
        Array.prototype.forEach.call(chips, function (c) { c.classList.toggle("is-active", c === chip); });
        Array.prototype.forEach.call(items, function (it) {
          it.hidden = !!val && it.getAttribute("data-stage") !== val;
        });
        Array.prototype.forEach.call(container.querySelectorAll(".acc-group"), function (g) {
          g.hidden = !g.querySelector(".acc:not([hidden])");
        });
      });
    });
  }

  // One expandable class row (Foundations accordion).
  function accRow(c) {
    var row = document.createElement("div");
    row.className = "acc";
    row.setAttribute("data-stage", c.stage || "");

    var head = document.createElement("button");
    head.type = "button";
    head.className = "acc-head";
    head.setAttribute("aria-expanded", "false");
    head.innerHTML =
      '<span class="acc-main">' +
        '<span class="acc-name">' + escapeHtml(c.name) + "</span>" +
        '<span class="acc-badges">' +
          (c.format ? '<span class="acc-format">' + escapeHtml(c.format) + "</span>" : "") +
          stageChip(c.stage) +
        "</span>" +
      "</span>" +
      '<span class="acc-toggle" aria-hidden="true"></span>';

    var body = document.createElement("div");
    body.className = "acc-body";
    body.hidden = true;
    var html = "";
    if (c.desc) html += '<p class="acc-desc">' + escapeHtml(c.desc) + "</p>";
    if (c.covers && c.covers.length) {
      html += '<p class="syl-label">What we\'ll cover</p><ul class="syl-list">' +
        c.covers.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul>";
    }
    if (c.walkout) html += '<p class="syl-label">What you\'ll walk out with</p><p class="syl-walkout">' + escapeHtml(c.walkout) + "</p>";
    body.innerHTML = html;

    if (isSoon(c)) {
      var s = document.createElement("p");
      s.className = "soon-note";
      s.innerHTML = soonNoteHTML(c);
      body.appendChild(s);
    }
    var foot = document.createElement("div");
    foot.className = "acc-foot";
    if (!isSoon(c) && c.booking) {
      var bk = document.createElement("div");
      bk.className = "book";
      var b = document.createElement("a");
      b.className = "btn btn-solid";
      b.href = c.booking;
      b.textContent = c.free ? "Save your seat" : "See dates & book";
      bk.appendChild(b);
      if (c.free) { var fn = document.createElement("span"); fn.className = "free-note"; fn.textContent = "Free"; bk.appendChild(fn); }
      foot.appendChild(bk);
    }
    var more = document.createElement("a");
    more.className = "acc-more";
    more.href = "class.html?c=" + encodeURIComponent(c.slug);
    more.textContent = "Full details →";
    foot.appendChild(more);
    body.appendChild(foot);

    row.appendChild(head);
    row.appendChild(body);
    return row;
  }

  function wireAccordion(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll(".acc-head"), function (head) {
      head.addEventListener("click", function () {
        var row = head.parentNode;
        var body = row.querySelector(".acc-body");
        var open = row.classList.toggle("is-open");
        head.setAttribute("aria-expanded", open ? "true" : "false");
        body.hidden = !open;
      });
    });
  }

  // FOUNDATIONS — filterable accordion grouped by phase.
  function renderFoundations(container) {
    container.textContent = "";
    var compact = container.dataset.compact === "true";
    var classes = quintaByTrack("foundations");

    if (compact) {
      var order0 = [], groups0 = {};
      classes.forEach(function (c) { var k = c.phaseNum + "|" + c.phase; if (!groups0[k]) { groups0[k] = []; order0.push(k); } groups0[k].push(c); });
      order0.forEach(function (k) {
        var p = k.split("|"), lab = document.createElement("p"); lab.className = "track-phase";
        lab.appendChild(document.createTextNode(p[0] + " " + p[1]));
        container.appendChild(lab);
        groups0[k].forEach(function (c) { container.appendChild(classRowCompact(c)); });
      });
      return;
    }

    container.appendChild(buildStageFilter(classes));
    var list = document.createElement("div");
    list.className = "hub-list";

    var order = [], groups = {};
    classes.forEach(function (c) {
      var key = c.phaseNum + "|" + c.phase;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(c);
    });

    order.forEach(function (key) {
      var parts = key.split("|");
      var groupSoon = groups[key].some(function (c) { return isSoon(c); });
      var group = document.createElement("section");
      group.className = "acc-group";

      var head = document.createElement("div");
      head.className = "phase-head";
      head.innerHTML =
        '<span class="phase-plate">' + phaseGrowth(parts[0]) + "</span>" +
        '<span class="phase-head-text"><span class="phase-head-num">Phase ' + parts[0] + '</span>' +
        '<span class="phase-head-name">' + escapeHtml(parts[1]) + "</span></span>" +
        (groupSoon ? '<span class="tag-soon phase-tag">Coming this fall</span>' : "");
      group.appendChild(head);

      var accList = document.createElement("div");
      accList.className = "acc-list";
      groups[key].forEach(function (c) { accList.appendChild(accRow(c)); });
      group.appendChild(accList);
      list.appendChild(group);
    });

    container.appendChild(list);
    wireAccordion(list);
    wireStageFilter(container);
  }

  // PRACTICE — filterable cards.
  function practiceCard(c) {
    var a = document.createElement("a");
    a.className = "pcard";
    a.href = "class.html?c=" + encodeURIComponent(c.slug);
    a.setAttribute("data-stage", c.stage || "");
    var html = '<span class="pcard-badges">';
    if (c.free) html += '<span class="pcard-free">Free</span>';
    html += stageChip(c.stage);
    if (isSoon(c)) html += '<span class="tag-soon">' + soonLabel(c) + '</span>';
    html += "</span>";
    html += '<span class="pcard-name">' + escapeHtml(c.name) + "</span>";
    if (c.desc) html += '<span class="pcard-desc">' + escapeHtml(c.desc) + "</span>";
    if (c.format) html += '<span class="pcard-format">' + escapeHtml(c.format) + "</span>";
    html += '<span class="pcard-link">Details &amp; book →</span>';
    a.innerHTML = html;
    return a;
  }

  function renderPractice(container) {
    container.textContent = "";
    var compact = container.dataset.compact === "true";
    var classes = quintaByTrack("practice");
    if (compact) {
      classes.forEach(function (c) { container.appendChild(classRowCompact(c)); });
      return;
    }
    container.appendChild(buildStageFilter(classes));
    var grid = document.createElement("div");
    grid.className = "pcard-grid";
    classes.forEach(function (c) { grid.appendChild(practiceCard(c)); });
    container.appendChild(grid);
    wireStageFilter(container);
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

  /* ---------- 2b. Testimonial coverflow carousel ---------- */

  function renderTestimonials(mount) {
    var data = window.QUINTA_TESTIMONIALS || [];
    var stage = mount.querySelector(".tstage");
    var nav = mount.querySelector(".tnav");
    if (!stage || !data.length) { if (mount) mount.style.display = "none"; return; }

    var n = data.length;
    var active = 0;

    var cards = data.map(function (t, i) {
      var card = document.createElement("article");
      card.className = "tcard";

      var bg = document.createElement("div");
      bg.className = "tcard-bg";
      if (t.bg) { bg.classList.add("has-photo"); bg.style.backgroundImage = 'url("' + String(t.bg).replace(/["'()]/g, "") + '")'; }
      else bg.classList.add("tcard-bg--g" + (i % 4)); // brand-green fallback, rotates
      card.appendChild(bg);

      var inner = document.createElement("div");
      inner.className = "tcard-inner";
      inner.innerHTML =
        '<span class="tcard-mark" aria-hidden="true">&ldquo;</span>' +
        '<blockquote class="tcard-quote">' + escapeHtml(t.quote) + "</blockquote>" +
        '<figcaption class="tcard-author">' + escapeHtml(t.author) +
        (t.role ? '<span class="tcard-role">' + escapeHtml(t.role) + "</span>" : "") +
        "</figcaption>";
      card.appendChild(inner);

      card.addEventListener("click", function () {
        if (i !== active) { active = i; layout(); }
      });
      stage.appendChild(card);
      return card;
    });

    function layout() {
      cards.forEach(function (card, i) {
        var rel = i - active;
        if (rel > n / 2) rel -= n;
        if (rel < -n / 2) rel += n;
        var abs = Math.abs(rel);
        var dir = rel > 0 ? 1 : -1;
        var base = "translate(-50%,-50%) ";
        if (abs === 0) {
          card.style.transform = base + "translateX(0) rotateY(0deg) scale(1)";
          card.style.opacity = "1";
          card.style.zIndex = "30";
          card.style.pointerEvents = "auto";
          card.classList.add("is-active");
        } else if (abs === 1) {
          card.style.transform = base + "translateX(" + (dir * 62) + "%) rotateY(" + (-dir * 38) + "deg) scale(.82)";
          card.style.opacity = ".5";
          card.style.zIndex = "20";
          card.style.pointerEvents = "auto";
          card.classList.remove("is-active");
        } else {
          card.style.transform = base + "translateX(" + (dir * 104) + "%) rotateY(" + (-dir * 42) + "deg) scale(.64)";
          card.style.opacity = "0";
          card.style.zIndex = "10";
          card.style.pointerEvents = "none";
          card.classList.remove("is-active");
        }
      });
    }

    function go(step) { active = (active + step + n) % n; layout(); }

    var prev = mount.querySelector(".tprev");
    var next = mount.querySelector(".tnext");
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });

    mount.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    });

    // Touch swipe
    var x0 = null;
    stage.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      x0 = null;
    });

    if (n < 2 && nav) nav.style.display = "none";
    layout();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // "From the blog" teasers on the hub pages — newest 3 posts from blog/posts.js.
  function renderBlogTeasers() {
    var box = document.getElementById("blog-teaser-list");
    if (!box || typeof QUINTA_POSTS === "undefined") return;
    var months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    function fmt(d) {
      var p = (d || "").split("-");
      return p.length === 3 ? months[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10) + ", " + p[0] : (d || "");
    }
    var posts = QUINTA_POSTS.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    }).slice(0, 3);
    box.innerHTML = "";
    posts.forEach(function (p) {
      var a = document.createElement("a");
      a.className = "bt-card";
      a.href = "blog/" + p.slug + ".html";
      var html = "";
      if (p.image) html += '<span class="bt-thumb"><img src="images/' + escapeHtml(p.image) + '" alt="" loading="lazy"></span>';
      html += '<p class="bt-meta">' + fmt(p.date) + "</p>";
      html += '<h3 class="bt-card-title">' + escapeHtml(p.title) + "</h3>";
      html += '<p class="bt-excerpt">' + escapeHtml(p.excerpt || "") + "</p>";
      html += '<span class="bt-link">Read more &rarr;</span>';
      a.innerHTML = html;
      box.appendChild(a);
    });
  }

  /* ---------- 3. Class detail page ---------- */

  // Inject per-class OpenGraph/Twitter tags so shared class links unfurl correctly
  // (the static class.html head has none, and every class would otherwise look identical).
  function setClassOG(c) {
    var base = "https://quintaand.co/";
    var url = base + "class.html?c=" + encodeURIComponent(c.slug);
    var img = base + "images/og-" + (c.track === "foundations" ? "foundations" : "practice") + ".jpg";
    var tags = [
      ["property", "og:type", "website"],
      ["property", "og:site_name", "Quinta & Co."],
      ["property", "og:title", c.name],
      ["property", "og:description", c.desc],
      ["property", "og:url", url],
      ["property", "og:image", img],
      ["name", "twitter:card", "summary_large_image"],
      ["name", "twitter:title", c.name],
      ["name", "twitter:image", img]
    ];
    tags.forEach(function (t) {
      var sel = "meta[" + t[0] + '="' + t[1] + '"]';
      var el = document.head.querySelector(sel);
      if (!el) { el = document.createElement("meta"); el.setAttribute(t[0], t[1]); document.head.appendChild(el); }
      el.setAttribute("content", t[2]);
    });
  }

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
    setMetaTag("description", c.desc);
    setCanonical("https://quintaand.co/class.html?c=" + encodeURIComponent(c.slug));
    setClassOG(c);
    injectCourseSchema(c);

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
    if (c.stage) {
      var dstg = document.createElement("span");
      dstg.className = "stage-tag";
      dstg.innerHTML = '<span class="stage-ico">' + stageIcon(c.stage) + "</span>" + escapeHtml(c.stage);
      label.appendChild(dstg);
    }
    detail.appendChild(label);

    var h1 = document.createElement("h1");
    // Glue the last two words so a class title never drops a single-word widow.
    h1.innerHTML = escapeHtml(c.name).replace(/ ([^ ]+)$/, " $1");
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
      var prereqLabel = document.createElement("p");
      prereqLabel.className = "syl-label";
      prereqLabel.textContent = "Know before you go";
      detail.appendChild(prereqLabel);
      var prereq = document.createElement("p");
      prereq.className = "syl-prereq";
      prereq.textContent = c.prereq;
      detail.appendChild(prereq);
    }

    // Booking area
    if (isSoon(c)) {
      var soon = document.createElement("p");
      soon.className = "soon-note";
      soon.innerHTML = soonNoteHTML(c);
      detail.appendChild(soon);
      var cbook = document.createElement("div");
      cbook.className = "book";
      var cbtn = document.createElement("a");
      cbtn.className = "btn btn-solid";
      cbtn.href = "index.html#coffee";
      cbtn.textContent = "Start free: Coffee with Quinta";
      cbook.appendChild(cbtn);
      detail.appendChild(cbook);
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

  /* ---------- SEO helpers (per-class meta + structured data) ---------- */
  function setMetaTag(name, content) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", name); document.head.appendChild(m); }
    m.setAttribute("content", content);
  }
  function setCanonical(url) {
    var l = document.querySelector('link[rel="canonical"]');
    if (!l) { l = document.createElement("link"); l.setAttribute("rel", "canonical"); document.head.appendChild(l); }
    l.setAttribute("href", url);
  }
  function injectCourseSchema(c) {
    var data = {
      "@context": "https://schema.org",
      "@type": "Course",
      "name": c.name,
      "description": c.desc,
      "provider": { "@type": "EducationalOrganization", "name": "Quinta & Co.", "sameAs": "https://quintaand.co/" },
      "url": "https://quintaand.co/class.html?c=" + c.slug
    };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  /* ---------- launching-soon screen ---------- */
  function showHolding(note) {
    function build() {
      var el = document.createElement("div");
      el.className = "holding";
      el.innerHTML =
        '<span class="wordmark">' + SPROUT_SVG + 'Quinta &amp; Co.</span>' +
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
