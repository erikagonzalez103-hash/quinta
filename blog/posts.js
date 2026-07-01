/* ============================================================
   Quinta & Co. — blog post index

   This list controls what shows on the blog landing page
   (/blog/). Each entry is one post. NEWEST GOES AT THE TOP.

   TO ADD A POST (two quick steps):
   1. Copy _template.html, rename it to your post's slug
      (e.g. pricing-with-confidence.html), and paste your
      writing into it. (Instructions are inside the template.)
   2. Add one block below — copy an existing one, change the
      fields, and put it at the top of the list.

   Fields:
     slug    - the file name without ".html" (and the web address)
     title   - the headline
     date    - "YYYY-MM-DD" (used for ordering + display)
     author  - the byline (e.g. "Erika Gonzalez Harrison")
     excerpt - one sentence shown on the blog landing page
     image   - thumbnail shown on the blog list: a file name from
               /images/ (usually the post's header image). Leave
               off and the card simply shows no thumbnail.
   ============================================================ */

const QUINTA_POSTS = [
  {
    slug: "more-women-starting-businesses",
    title: "More Women Are Starting Businesses Than Ever — Here's What AI Actually Changed.",
    date: "2026-06-28",
    author: "Erika Gonzalez Harrison",
    excerpt: "More women are starting businesses than ever, because AI dropped the cost of trying — but starting isn't the same as staying open. Here's what actually changed, and what didn't.",
    image: "blog-more-women.jpg"
  },
  {
    slug: "not-replacing-experience",
    title: "Why I'm Not Replacing Experience",
    date: "2026-04-19",
    author: "Erika Gonzalez Harrison",
    excerpt: "After leaving corporate advertising to co-found a construction company, I found AI's real value isn't replacing expertise — it's recreating the departmental support I lost.",
    image: "blog-not-replacing-experience.jpg"
  },
  {
    slug: "ai-gap-women-owned-businesses",
    title: "The AI gap that's costing women-owned businesses everything",
    date: "2026-06-04",
    author: "Erika Gonzalez Harrison",
    excerpt: "Women adopt AI at half the rate of men, but our businesses are growing 3x faster. The math doesn't add up — and neither does ignoring it.",
    image: "blog-ai-gap.jpg"
  },
  {
    slug: "three-women-building-ai",
    title: "What 3 Women Building AI Say Comes Next (And What It Means for Yours)",
    date: "2026-06-21",
    author: "Erika Gonzalez Harrison",
    excerpt: "Mira Murati, Fei-Fei Li, and the women shaping AI's next chapter aren't talking about robots replacing you.",
    image: "blog-three-women.jpg"
  },
  {
    slug: "three-ai-quick-wins",
    title: "Three AI Quick Wins Every Woman Business Owner Should Start With",
    date: "2026-06-14",
    author: "Erika Gonzalez Harrison",
    excerpt: "Skip the strategy sessions and automation overwhelm. Start with the pain that keeps you up at 2 AM — and the simple tools that solve it in under four hours.",
    image: "blog-quick-wins.jpg"
  }
];
