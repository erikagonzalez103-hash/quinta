/* ============================================================
   Quinta & Co. — blog post index

   This list controls what shows on the blog landing page
   (/blog/). Each entry is one post. NEWEST GOES AT THE TOP.

   TO ADD A POST (two quick steps):
   1. Copy _template.html, rename it to your post's slug
      (e.g. pricing-with-confidence.html), and paste your
      writing into it. (Instructions are inside the template.)
   2. Add one block below — copy an existing one, change the
      five fields, and put it at the top of the list.

   Fields:
     slug    - the file name without ".html" (and the web address)
     title   - the headline
     date    - "YYYY-MM-DD" (used for ordering + display)
     author  - "Quinta & Co." or your personal-brand name
     excerpt - one sentence shown on the blog landing page
   ============================================================ */

const QUINTA_POSTS = [
  {
    slug: "welcome",
    title: "Why I started writing this",
    date: "2026-06-24",
    author: "Quinta & Co.",
    excerpt: "Short, practical notes on running a business and putting AI to work — the same things I teach in class, written down."
  }
];
