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
    slug: "women-helping-women",
    title: "Are You a Woman-Owned Business? Here's Why Women Helping Women Is Your Fastest Path Forward",
    date: "2026-08-23",
    author: "Erika Gonzalez Harrison",
    excerpt: "39.2% of U.S. businesses are woman-owned — and they generate 6.2% of the revenue. A 2024 University of Chicago study found women mentored by women do measurably better. Plus the free Dallas programs worth your afternoon.",
    image: "blog-women-helping-women.webp"
  },
  {
    slug: "questions-new-founders-should-ask",
    title: "Ladies, What Questions Should a New Founder Be Asking? The Ones You Don't Know Exist Yet",
    date: "2026-08-11",
    author: "Erika Gonzalez Harrison",
    excerpt: "Search works beautifully once you know the name of the thing — but you can't look up a mistake you don't know exists. Why the knowledge that saves you travels through people, not search results.",
    image: "blog-questions-you-dont-know.webp"
  },
  {
    slug: "why-women-dont-start-businesses",
    title: "Why Haven't More Women Started Businesses? It's Fear, Not the Idea — and the #1 Fear Might Surprise You.",
    date: "2026-07-26",
    author: "Erika Gonzalez Harrison",
    excerpt: "65% of women have never started a business — and the #1 fear isn't money, it's losing yourself. What the data says about fear, pricing, and starting scared anyway.",
    image: "blog-fear-not-the-idea.webp"
  },
  {
    slug: "texas-llc-cost",
    title: "What Does It Actually Cost to Form an LLC in Texas?",
    date: "2026-07-18",
    author: "Erika Gonzalez Harrison",
    excerpt: "The only required cost is the $300 filing fee. Everything else — the $99 EIN, the $249 agent, the $2,000 package — is optional, and most of it is markup. Here's the real math.",
    image: "blog-llc-cost.webp"
  },
  {
    slug: "where-to-start-with-ai",
    title: "You Don't Need to Understand AI to Use It. You Need to Know Where to Start.",
    date: "2026-07-06",
    author: "Erika Gonzalez Harrison",
    excerpt: "“I'm not technical.” “Too expensive.” “No time.” None of the three is really about AI — they're about starting. Here are the three low-stakes tasks to start with.",
    image: "blog-where-to-start.webp"
  },
  {
    slug: "more-women-starting-businesses",
    title: "More Women Are Starting Businesses Than Ever — Here's What AI Actually Changed.",
    date: "2026-06-28",
    author: "Erika Gonzalez Harrison",
    excerpt: "More women are starting businesses than ever, because AI dropped the cost of trying — but starting isn't the same as staying open. Here's what actually changed, and what didn't.",
    image: "blog-more-women.webp"
  },
  {
    slug: "not-replacing-experience",
    title: "Why I'm Not Replacing Experience",
    date: "2026-04-19",
    author: "Erika Gonzalez Harrison",
    excerpt: "After leaving corporate advertising to co-found a construction company, I found AI's real value isn't replacing expertise — it's recreating the departmental support I lost.",
    image: "blog-not-replacing-experience.webp"
  },
  {
    slug: "ai-gap-women-owned-businesses",
    title: "The AI gap that's costing women-owned businesses everything",
    date: "2026-06-04",
    author: "Erika Gonzalez Harrison",
    excerpt: "Women adopt AI at half the rate of men, but our businesses are growing 3x faster. The math doesn't add up — and neither does ignoring it.",
    image: "blog-ai-gap.webp"
  },
  {
    slug: "three-women-building-ai",
    title: "What 3 Women Building AI Say Comes Next (And What It Means for Yours)",
    date: "2026-06-21",
    author: "Erika Gonzalez Harrison",
    excerpt: "Mira Murati, Fei-Fei Li, and the women shaping AI's next chapter aren't talking about robots replacing you.",
    image: "blog-three-women.webp"
  },
  {
    slug: "three-ai-quick-wins",
    title: "Three AI Quick Wins Every Woman Business Owner Should Start With",
    date: "2026-06-14",
    author: "Erika Gonzalez Harrison",
    excerpt: "Skip the strategy sessions and automation overwhelm. Start with the pain that keeps you up at 2 AM — and the simple tools that solve it in under four hours.",
    image: "blog-quick-wins.webp"
  }
];
