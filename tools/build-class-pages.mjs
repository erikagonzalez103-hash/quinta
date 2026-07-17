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

  const booking = soon
    ? `      <p class="soon-note">${c.track === "foundations"
        ? `The Foundations open this fall (2026). Be first to hear — and grab a free hour in the meantime — at <a href="../coffee.html">Coffee with Quinta</a>.`
        : `Not open just yet. Be first to hear at <a href="../coffee.html">Coffee with Quinta</a>.`}</p>
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
    { q: "Do I need any experience?", a: c.prereq ? c.prereq : "None — every Quinta & Co. class is plain language and hands-on." },
    ...(c.walkout ? [{ q: "What will I walk out with?", a: `${c.walkout} Every Quinta & Co. class ends with something real you keep.` }] : []),
    soon
      ? { q: "When can I take this class?", a: "Enrollment opens Fall 2026. Join the waitlist at quintaand.co/waitlist to hear first — and the free monthly Coffee with Quinta is open in the meantime." }
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
<link rel="stylesheet" href="../styles.css?v=3">
<script type="application/ld+json" data-course-schema>${schema}</script>
<script type="application/ld+json">${faqSchema}</script>
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
      <p class="syl-walkout">${esc(c.walkout)}</p>\n` : ""}${c.prereq ? `      <p class="syl-label">Know before you go</p>
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

<script src="../config.js?v=3"></script>
<script src="../classes.js?v=4"></script>
<script src="../icons.js?v=3"></script>
<script src="../app.js?v=3" defer></script>
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
