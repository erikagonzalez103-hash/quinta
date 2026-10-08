/* ============================================================
   Quinta & Co. — static class-page generator

   WHAT THIS IS
   Search engines and AI answer engines mostly read raw HTML and
   don't run JavaScript, so class pages built only by app.js look
   empty to them. This script stamps the real content from
   classes.js into one static HTML file per class, in /classes/.
   app.js still re-renders on load, so the pages stay dynamic for
   humans — the static copy is for crawlers and link previews.

   WHEN TO RUN IT
   Any time classes.js or config.js changes (new class, class opens
   for enrollment, copy edits):

       node tools/build-class-pages.mjs

   then commit the regenerated files in /classes/ along with your
   classes.js change. It also prints fresh sitemap lines.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// CACHE VERSIONS: the ?v= on config.js and classes.js in the page template
// below must match every other page on the site. Bump them HERE whenever you
// bump them anywhere else - a version bumped only on the built pages is
// silently rolled back by the next rebuild, and browsers then serve a stale
// copy. (On 30 Sep a rebuild took every class page from v8/v9 back to v7/v8.)

// classes.js / config.js are written for the browser — give them the globals they expect.
globalThis.window = globalThis;
const load = (f) => new Function(readFileSync(join(root, f), "utf-8") + "; return typeof QUINTA_CLASSES !== 'undefined' ? QUINTA_CLASSES : undefined;")();
new Function(readFileSync(join(root, "config.js"), "utf-8"))();
const CLASSES = load("classes.js");
const FOUNDATIONS_OPEN = !!(globalThis.QUINTA_CONFIG && globalThis.QUINTA_CONFIG.FOUNDATIONS_OPEN);

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isSoon = (c) => c.open ? false : (!!c.soon || (c.track === "foundations" && !FOUNDATIONS_OPEN));

function page(c) {
  const hubName = c.track === "foundations" ? "The Foundations" : "The Practice";
  const hubHref = c.track === "foundations" ? "../foundations.html" : "../practice.html";
  const ogImg = `https://quintaand.co/images/og-${c.track === "foundations" ? "foundations" : "practice"}.jpg`;
  const url = `https://quintaand.co/classes/${c.slug}.html`;
  const soon = isSoon(c);
  const label = c.phase ? `${hubName} · ${c.phase}` : hubName;

  const schema = JSON.stringify({
    "@context": "https://schema.org", "@type": "Course",
    name: c.name, description: c.desc,
    provider: { "@type": "EducationalOrganization", name: "Quinta & Co.", url: "https://quintaand.co/", sameAs: ["https://www.linkedin.com/company/quintaandco/", "https://www.instagram.com/quintapractice/"] },
    url, ...(c.free ? { isAccessibleForFree: true } : {}),
  });

  const covers = (c.covers || []).map((i) => `        <li>${esc(i)}</li>`).join("\n");
  const requires = (c.requires || []).map((i) => `        <li>${esc(i)}</li>`).join("\n");

  /* No month, no named event, no claim that anything else is open. This line
     sat on every undated class saying other classes were "open for September"
     long after September had no dates left, because a date written into a
     template goes stale the day it passes. Keep it timeless. */
  const booking = soon
    ? `      <p class="soon-note">${c.track === "foundations"
        ? `Dates for this class aren't set yet. Join the waitlist and you'll hear the day it opens.`
        : `Not open just yet. Join the waitlist and you'll hear the day it opens.`}</p>
      <div class="book">
        <a class="btn btn-solid" href="../waitlist.html?c=${encodeURIComponent(c.slug)}">Join the waitlist</a>
        <a class="btn btn-ghost" href="../coffee.html">Start free: Coffee with Quinta</a>
      </div>`
    : `      <div class="book">
        <a class="btn btn-solid" href="${esc(c.booking || "../coffee.html")}">${c.free ? "Save your seat" : "See dates &amp; book"}</a>${c.free ? '\n        <span class="free-note">Free</span>' : ""}
      </div>`;

  const disclaimer = c.disclaimer ? `\n      <p class="class-disclaimer">${esc(c.disclaimer)}</p>` : "";

  // Per-class FAQ — derived from the class data, so it can only say true things.
  const stageAnswer = {
    "Just starting": "Women founders who are just starting out — no prior experience assumed.",
    "Up and running": "Women founders whose business is up and running and who want to strengthen this part of it.",
    "Established": "Established women founders ready to take this further.",
  }[c.stage] || "Women founders at any stage.";
  const trackFlavor = c.track === "foundations"
    ? " It's part of The Foundations, the plain-language business fundamentals track."
    : " It's part of The Practice, the hands-on AI track — no technical background needed.";
  const faqs = [
    { q: `Who is ${c.name} for?`, a: stageAnswer + trackFlavor },
    // A class with outside eligibility rules gets asked a different question —
    // "do I need experience?" is not what someone facing WBENC criteria is asking.
    ...(c.requires && c.requires.length
      ? [{ q: `Who is eligible to take ${c.name}?`, a: `${c.requiresLabel || "Before you register"} ${c.requires.join(". ")}.${c.requiresNote ? " " + c.requiresNote.replace(/:$/, ".") : ""}` }]
      : [{ q: "Do I need any experience?", a: c.prereq ? c.prereq : "None — every Quinta & Co. class is plain language and hands-on." }]),
    ...(c.walkout ? [{ q: "What will I walk out with?", a: `${c.walkout} Every Quinta & Co. class ends with something real you keep.` }] : []),
    soon
      ? { q: "When can I take this class?", a: "This one doesn't have dates yet. Join the waitlist at quintaand.co/waitlist.html and you'll hear the day it opens." }
      : { q: "When can I take this class?", a: `It's open now — ${c.format || "live, small group"}. Dates and booking are right on this page.` },
  ];
  const faqHtml = faqs.map((f, i) => `      <div class="faq-item">
        <span class="faq-num" aria-hidden="true">${i + 1}</span>
        <div class="faq-qa">
          <h3>${esc(f.q)}</h3>
          <p>${esc(f.a)}</p>
        </div>
      </div>`).join("\n");
  const faqSchema = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- GENERATED by tools/build-class-pages.mjs from classes.js — edit classes.js, not this file. -->
<title>${esc(c.name)} — Quinta &amp; Co. | ${c.track === "foundations" ? "Business Fundamentals" : "Practical AI"} for Women Founders</title>
<meta name="description" content="${esc(c.desc)}">
<meta name="theme-color" content="#FAFAF6">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Quinta &amp; Co.">
<meta property="og:title" content="${esc(c.name)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImg}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.name)}">
<meta name="twitter:image" content="${ogImg}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css?v=4">
<script type="application/ld+json" data-course-schema>${schema}</script>
<script type="application/ld+json">${faqSchema}</script>
<!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "4d1040aa058d40038ba0cf67b562c42e"}'></script><!-- End Cloudflare Web Analytics -->
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-QM9XPPN7XC"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-QM9XPPN7XC');
</script>

<!-- Meta Pixel and LinkedIn Insight were added to every page by hand after this
     generator was written, and never folded back in — so regenerating used to
     silently strip them from all 19 class pages, the highest-intent pages on
     the site. They live here now. If either ID changes, change it HERE as well
     as in the static pages. -->
<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1179541285251913');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1179541285251913&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel -->
<!-- LinkedIn Insight Tag -->
<script type="text/javascript">
_linkedin_partner_id = "9479266";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script><script type="text/javascript">
(function(l) {
if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
window.lintrk.q=[]}
var s = document.getElementsByTagName("script")[0];
var b = document.createElement("script");
b.type = "text/javascript";b.async = true;
b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b, s);})(window.lintrk);
</script>
<noscript>
<img height="1" width="1" style="display:none;" alt="" src="https://px.ads.linkedin.com/collect/?pid=9479266&fmt=gif" />
</noscript>
<!-- End LinkedIn Insight Tag -->
</head>
<body data-page="class" data-class="${esc(c.slug)}" data-root="../">

<header>
  <div class="bar">
    <a href="../index.html" class="wordmark"><img class="logo-img" src="../brand/logo-stacked-sage.svg" alt="Quinta &amp; Co. — home" width="171" height="32"></a>
    <div class="bar-right">
      <nav class="top">
        <a href="../foundations.html">The Foundations</a>
        <a href="../practice.html">The Practice</a>
        <a href="../about.html">About</a>
        <a href="../blog/index.html">Blog</a>
      </nav>
      <a href="../coffee.html" class="btn btn-solid btn-coffee">Start free: Coffee with Quinta</a>
    </div>
  </div>
</header>

<main>
  <!-- Static copy of the class, for crawlers; app.js re-renders it from classes.js on load. -->
  <div id="class-detail">
    <nav class="crumb wrap"><a href="${hubHref}">&larr; ${hubName}</a></nav>
    <section class="detail wrap">
      <p class="phase-label">${esc(label)}</p>
      <h1>${esc(c.name)}</h1>
      <p class="desc">${esc(c.desc)}</p>
${c.format ? `      <p class="syl-format">${esc(c.format)}</p>\n` : ""}${covers ? `      <p class="syl-label">What we'll cover</p>
      <ul class="syl-list">
${covers}
      </ul>\n` : ""}${c.walkout ? `      <p class="syl-label">What you'll walk out with</p>
      <p class="syl-walkout">${esc(c.walkout)}</p>\n` : ""}${requires ? `      <p class="syl-label">${esc(c.requiresLabel || "Before you register")}</p>
      <ul class="syl-list">
${requires}
      </ul>\n${c.requiresNote ? `      <p class="syl-prereq">${esc(c.requiresNote)}${(c.requiresLinks || []).map((l, i) => `${i === 0 ? " " : " &middot; "}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</p>\n` : ""}` : ""}${c.prereq ? `      <p class="syl-label">Know before you go</p>
      <p class="syl-prereq">${esc(c.prereq)}</p>\n` : ""}${booking}${disclaimer}
    </section>
  </div>

  <section class="faq wrap">
    <p class="label">Questions, answered</p>
    <h2 class="faq-title">About this class</h2>
    <div class="faq-list">
${faqHtml}
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <div class="frow">
      <div>
        <a href="../index.html" class="wordmark">Quinta &amp; Co.</a>
        <p class="fine" style="margin-top:10px">Practical business &amp; AI education · Dallas, Texas &amp; online</p>
      </div>
      <nav class="fnav">
        <a href="../foundations.html">The Foundations</a>
        <a href="../practice.html">The Practice</a>
        <a href="../about.html">About</a>
        <a href="../teach.html">Teach</a>
        <a href="../coffee.html">Book</a>
        <a href="mailto:hello@quintaand.co">Contact</a>
        <a href="../privacy.html">Privacy</a>
        <a href="../terms.html">Terms</a>
        <a href="../policies.html">Policies</a>
      </nav>
    </div>
    <p class="legal-disclaimer">Quinta &amp; Co. classes are educational and are not legal, tax, financial, or HR/employment advice. For decisions about your specific situation, please consult a qualified professional.</p>
    <p class="fine copyright">© <span id="year">2026</span> Quinta &amp; Co. · Dallas, Texas</p>
  </div>
</footer>

<script src="../config.js?v=8"></script>
<script src="../classes.js?v=21"></script>
<script src="../icons.js?v=3"></script>
<script src="../app.js?v=7" defer></script>
<script src="../js/meta.js?v=5" defer></script>${c.free ? "" : `
<script>
/* THE BOOK BUTTON MUST LEAD SOMEWHERE BOOKABLE.
   1. Wednesday 21 October is booked on oct21.html, not in Cal.com. If this
      class has a seat on sale that day, "Book October 21" goes first (until
      sales close at midnight going into the 21st), and says so if that
      session is online only.
   2. "See dates & book" opens Cal.com. If Cal.com answers that this class has
      no dates there, the button is taken away rather than opening an empty
      calendar (stress test, 7 Oct: Brand 101 and the Landlord class). With
      nothing on the 21st either, it becomes "Join the waitlist".
   If Cal.com can't be reached, nothing changes - unknown is not "no dates".
   Generated by tools/build-class-pages.mjs. */
(function () {
  var SLUG = ${JSON.stringify(c.slug)};
  var EVENT = ${JSON.stringify(((c.booking || "").match(/cal\.com\/quintaandco\/([a-z0-9-]+)/i) || [])[1] || "")};
  var OPEN21 = Date.now() < Date.parse("2026-10-21T00:00:00-05:00");
  var K = "sb_publishable_t7U8S0paeslz99Y600_ixA_PHauIQcf";
  var on21 = !OPEN21 ? Promise.resolve([]) :
    fetch("https://pmpaslevwimofohirves.supabase.co/rest/v1/rpc/oct21_sessions", {
      method: "POST", headers: { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" }, body: "{}"
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      return (rows || []).filter(function (s) { return s && s.class_slug === SLUG && s.seats_left > 0; });
    }).catch(function () { return []; });
  var iso = function (d) { return d.toISOString().slice(0, 10); };
  var now = new Date(), end = new Date(now.getTime() + 150 * 86400000);
  // true = has dates, false = Cal.com says none, null = couldn't ask
  var calDated = !EVENT ? Promise.resolve(null) :
    fetch("https://api.cal.com/v2/slots?eventTypeSlug=" + EVENT + "&username=quintaandco&start=" + iso(now) + "&end=" + iso(end),
      { headers: { "cal-api-version": "2024-09-04" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { return d && d.data ? Object.keys(d.data).length > 0 : null; })
    .catch(function () { return null; });

  function apply(got) {
    var mine = got[0], dated = got[1];
    var book = document.querySelector("#class-detail .book");
    if (!book) return;
    var cal = book.querySelector('a[href*="cal.com/"]');
    if (!cal) return;                        // a waitlist page already
    var note = document.querySelector("#class-detail .book-note");
    if (dated === false) {
      cal.remove();
      if (!mine.length) {
        var w = document.createElement("a");
        w.className = "btn btn-solid";
        w.href = "../waitlist.html?c=" + encodeURIComponent(SLUG);
        w.textContent = "Join the waitlist";
        book.insertBefore(w, book.firstChild);
        if (note) note.textContent = "No dates on the calendar right now. Join the waitlist and you'll hear the day new ones go up.";
      } else if (note) {
        note.textContent = "Right now this class runs on Wednesday, October 21. Later dates go up here when they're set.";
      }
    } else if (mine.length) {
      cal.classList.remove("btn-solid"); cal.classList.add("btn-ghost");
    }
    if (mine.length) {
      var a = document.createElement("a");
      a.className = "btn btn-solid";
      a.href = "../oct21.html";
      a.textContent = "Book October 21";
      book.insertBefore(a, book.firstChild);
      if (mine.every(function (s) { return s.format === "online"; })) {
        var o = document.createElement("span");
        o.className = "price-note";
        o.textContent = "October 21 session: online only";
        a.after(o);
      }
    }
  }
  // app.js draws the class on DOMContentLoaded; change it after that.
  function go() { setTimeout(function () { Promise.all([on21, calDated]).then(apply); }, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
</script>
<script>
/* EDITED IN THE PORTAL ("Edit my class"). A teacher's saved wording shows here
   the moment she saves, instead of waiting for tools/publish-class-edits.mjs
   to write it into this file - GitHub runs that job late, sometimes hours
   late. Once it has, the text below already matches and nothing changes.
   Only the description, "What we'll cover", walk-out and "Know before you go".
   Generated by tools/build-class-pages.mjs. */
(function () {
  var slug = ${JSON.stringify(c.slug)};
  var K = "sb_publishable_t7U8S0paeslz99Y600_ixA_PHauIQcf";
  var got = fetch("https://pmpaslevwimofohirves.supabase.co/rest/v1/class_edits?slug=eq." + slug +
    "&select=description,covers,walkout,prereq,minutes", { headers: { apikey: K, Authorization: "Bearer " + K } })
    .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  function el(tag, cls, text) { var n = document.createElement(tag); n.className = cls; n.textContent = text; return n; }
  function apply(rows) {
    var e = rows && rows[0];
    var sec = document.querySelector("#class-detail .detail");
    if (!e || !sec || !e.description || !(e.covers || []).length) return;
    var labels = Array.prototype.slice.call(sec.querySelectorAll("p.syl-label"));
    function label(t) { return labels.filter(function (l) { return l.textContent === t; })[0] || null; }
    var stop = sec.querySelector(".soon-note, .book, .book-note, .class-disclaimer");
    var d = sec.querySelector("p.desc"); if (d) d.textContent = e.description;
    var fm = sec.querySelector("p.syl-format");
    if (fm && e.minutes) fm.textContent = /^\\s*\\d+\\s*minutes?/i.test(fm.textContent)
      ? fm.textContent.replace(/^\\s*\\d+\\s*minutes?/i, e.minutes + " minutes") : e.minutes + " minutes · " + fm.textContent;
    var cl = label("What we\\u2019ll cover") || label("What we'll cover"), ul = cl && cl.nextElementSibling;
    if (ul && ul.tagName === "UL") {
      ul.innerHTML = "";
      e.covers.forEach(function (x) { var li = document.createElement("li"); li.textContent = x; ul.appendChild(li); });
    }
    var wl = label("What you\\u2019ll walk out with") || label("What you'll walk out with"), wp = wl && wl.nextElementSibling;
    if (e.walkout) {
      if (wp) wp.textContent = e.walkout;
      else if (ul) { wp = el("p", "syl-walkout", e.walkout); ul.after(wp); wp.before(el("p", "syl-label", "What you'll walk out with")); }
    } else if (wl) { if (wp) wp.remove(); wl.remove(); }
    var pl = label("Know before you go"), pp = pl && pl.nextElementSibling;
    if (e.prereq) {
      if (pp) pp.textContent = e.prereq;
      else { var a = el("p", "syl-label", "Know before you go"), b = el("p", "syl-prereq", e.prereq);
             if (stop) { sec.insertBefore(a, stop); sec.insertBefore(b, stop); } else { sec.appendChild(a); sec.appendChild(b); } }
    } else if (pl) { if (pp) pp.remove(); pl.remove(); }
  }
  // app.js draws the class on DOMContentLoaded; patch after it has.
  function go() { setTimeout(function () { got.then(apply); }, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
</script>`}
</body>
</html>
`;
}

mkdirSync(join(root, "classes"), { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const sitemapLines = [];
let n = 0;
for (const c of CLASSES) {
  if (c.url) continue; // classes with their own page (Coffee) skip generation
  writeFileSync(join(root, "classes", `${c.slug}.html`), page(c));
  sitemapLines.push(`  <url><loc>https://quintaand.co/classes/${c.slug}.html</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>`);
  n++;
}
console.log(`generated ${n} pages in /classes/`);
console.log("--- sitemap lines ---");
console.log(sitemapLines.join("\n"));
