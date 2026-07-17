/* ============================================================
   Quinta & Co. — class data (SINGLE SOURCE OF TRUTH)

   Every class on the site is described here once. The hub pages
   (foundations.html, practice.html) and the per-class pages
   (class.html) are all built from this list, so you never edit
   the same words in two places.

   TO EDIT A CLASS: change the text below and save. That's it.

   TO ADD A NEW CLASS: copy the template block at the bottom of this
   list (the commented-out "trademark" example), paste it in, remove
   the // marks, and fill in the blanks. The website builds the new
   page and hub listing automatically. Then create the matching
   Cal.com event + Stripe product — full steps are in SETUP.md under
   "Adding a new class."

   Fields:
     slug       - short id used in the page URL and the booking link
     track      - "foundations" or "practice"
     phase      - the group it belongs to (Foundations only)
     phaseNum   - "01" / "02" / "03" (Foundations only)
     name       - the class name (shown verbatim from the home page)
     desc       - the one-sentence description (verbatim)
     format     - length + setting, e.g. "90 minutes · live, small group"
     covers     - array of "what we'll cover" bullets
     walkout    - the tangible thing you leave with
     prereq     - optional "good to know" / prerequisite line
     booking    - the Cal.com link for this class (null = not bookable yet)
     disclaimer - optional educational disclaimer (regulated topics)
     free       - true for free classes
     soon       - true for classes still in development

   NOTE: each booking link points at a Cal.com event type named after
   the slug, e.g. cal.com/quintaandco/entity-setup. Those event types
   must exist in your Cal.com account or the link will 404. Full list
   in SETUP.md.

   NOTE: syllabi below are STARTER DRAFTS — edit freely to match what
   you actually teach.
   ============================================================ */

const QUINTA_CLASSES = [

  /* ---------- THE FOUNDATIONS ---------- */

  // Phase 01 — Start right
  {
    slug: "entity-setup", track: "foundations", phase: "Start right", phaseNum: "01", stage: "Just starting",
    name: "Entity setup",
    desc: "Pick the right entity, get your EIN, and leave with a licensing checklist built for your exact business — plain English, no scare tactics.",
    format: "90 minutes · live, small group",
    covers: [
      "LLC vs. sole prop vs. S-corp — which actually fits your business",
      "Getting your EIN and registering with your state",
      "The licenses and permits your specific work requires",
      "Keeping your setup clean so taxes are easier later"
    ],
    walkout: "A licensing checklist built for your exact business, and a clear next step on your entity.",
    prereq: "Nothing — a great first step.",
    booking: "https://cal.com/quintaandco/entity-setup",
    disclaimer: "Educational only — not legal or tax advice. Confirm your structure with an attorney or CPA."
  },
  {
    slug: "banking", track: "foundations", phase: "Start right", phaseNum: "01", stage: "Just starting",
    name: "Banking",
    desc: "Open the right accounts, keep business and personal money truly separate, and start building business credit before you ever need it.",
    format: "90 minutes · live, small group",
    covers: [
      "Opening the right business checking (and when you need savings)",
      "Keeping business and personal money truly separate",
      "Starting to build business credit early",
      "Simple habits that keep your books clean from day one"
    ],
    walkout: "A plan for your accounts and first steps toward business credit.",
    booking: "https://cal.com/quintaandco/banking"
  },
  {
    slug: "insurance", track: "foundations", phase: "Start right", phaseNum: "01", stage: "Just starting",
    name: "Insurance",
    desc: "Sort out the coverage you actually need — liability, workers' comp, health — and leave with a risk worksheet ready to hand a broker.",
    format: "90 minutes · live, small group",
    covers: [
      "The coverage types that actually matter for your work",
      "Right-sizing coverage for your stage — not over- or under-insured",
      "Questions to ask a broker so you don't overpay"
    ],
    walkout: "A risk worksheet ready to hand a broker.",
    booking: "https://cal.com/quintaandco/insurance",
    disclaimer: "Educational only — not insurance or legal advice. Confirm coverage with a licensed broker."
  },

  // Phase 02 — Keep the books
  {
    slug: "bookkeeping-1", track: "foundations", phase: "Keep the books", phaseNum: "02", stage: "Up and running",
    name: "Bookkeeping I — Set up QuickBooks",
    desc: "Decide whether you even need QuickBooks, then set it up right — bank connected, accounts organized — and walk out with a working, categorized file.",
    format: "90 minutes · live, small group",
    covers: [
      "Whether you even need QuickBooks (and when a spreadsheet is fine)",
      "Setting it up: connecting your bank, organizing accounts",
      "Categorizing transactions without the headache"
    ],
    walkout: "A working, categorized QuickBooks file.",
    prereq: "Helpful to have your business bank account open first (see Banking).",
    booking: "https://cal.com/quintaandco/bookkeeping-1",
    disclaimer: "Educational only — not accounting or tax advice."
  },
  {
    slug: "bookkeeping-2", track: "foundations", phase: "Keep the books", phaseNum: "02", stage: "Up and running",
    name: "Bookkeeping II — Prep for your bookkeeper",
    desc: "Learn what a clean handoff looks like so your bookkeeper thanks you, instead of billing you to untangle a shoebox.",
    format: "90 minutes · live, small group",
    covers: [
      "What a clean handoff to a bookkeeper looks like",
      "The documents and access to organize ahead of time",
      "How to avoid getting billed to untangle a mess"
    ],
    walkout: "A handoff checklist your bookkeeper will love.",
    prereq: "Bookkeeping I, or an existing bookkeeping setup.",
    booking: "https://cal.com/quintaandco/bookkeeping-2",
    disclaimer: "Educational only — not accounting or tax advice."
  },
  {
    slug: "taxes", track: "foundations", phase: "Keep the books", phaseNum: "02", stage: "Up and running",
    name: "Taxes",
    desc: "Register for the right things from the start and leave with a calendar of every deadline that keeps your business legal.",
    format: "90 minutes · live, small group",
    covers: [
      "What to register for from the start (sales tax and more)",
      "The deadlines that keep your business legal",
      "Setting money aside so tax season isn't scary",
      "What your CPA actually needs from you"
    ],
    walkout: "A calendar of every tax deadline for your business.",
    booking: "https://cal.com/quintaandco/taxes",
    disclaimer: "Educational only — not tax advice. Confirm with a CPA or tax professional."
  },
  {
    slug: "pricing", track: "foundations", phase: "Keep the books", phaseNum: "02", stage: "Up and running",
    name: "Pricing",
    desc: "The step up from the basics: price your work to be both fair and sustainable — values and math together — and walk out with a real offer built on your own numbers.",
    format: "90 minutes · live, small group (the step-up class — expect to work)",
    covers: [
      "The real cost of doing business, so you never price at a loss",
      "Pricing models — hourly, project, value-based — and which fits",
      "Bringing your values and your numbers together",
      "Building an offer you can say out loud with confidence"
    ],
    walkout: "A real offer, priced on your own numbers.",
    prereq: "Comes alive once your books and numbers are roughly in order.",
    booking: "https://cal.com/quintaandco/pricing"
  },

  // Phase 03 — Build to last
  {
    slug: "contracts", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Up and running",
    name: "Contracts",
    desc: "Build a client agreement that protects you — scope, deposits, payment terms — and leave with a reusable template for your business.",
    format: "90 minutes · live, small group",
    covers: [
      "The clauses that protect you: scope, deposits, payment terms",
      "Setting expectations so projects don't go sideways",
      "A reusable agreement you can adapt per client"
    ],
    walkout: "A reusable client-agreement template.",
    booking: "https://cal.com/quintaandco/contracts",
    disclaimer: "Educational only — not legal advice. Have an attorney review your contracts."
  },
  {
    slug: "first-hire", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Established",
    name: "Your first hire",
    desc: "Know whether your next hire is a 1099 or a W-2, and what each one really requires, with a decision worksheet and a starter job description.",
    format: "90 minutes · live, small group",
    covers: [
      "1099 contractor vs. W-2 employee — the real differences",
      "What each actually requires of you (taxes, paperwork, risk)",
      "Writing a starter job description",
      "A simple decision worksheet for your situation"
    ],
    walkout: "A hire-type decision worksheet and a starter job description.",
    booking: "https://cal.com/quintaandco/first-hire",
    disclaimer: "Educational only — not legal or HR/employment advice. Confirm with an employment attorney or HR pro."
  },
  {
    slug: "certification", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Established",
    name: "Get certified — WBE / MBE / DBE",
    desc: "Learn what certification unlocks and exactly how to get it, taught by someone who's been through it, and leave with your roadmap.",
    format: "90 minutes · live, small group",
    covers: [
      "What WBE / MBE / DBE certification can unlock (contracts, programs)",
      "Whether it's worth it for your business",
      "The exact steps and documents to apply",
      "Lessons from someone who's been through it"
    ],
    walkout: "Your certification roadmap.",
    booking: "https://cal.com/quintaandco/certification"
  },
  {
    slug: "financial-planning", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Established",
    name: "Financial planning",
    desc: "Pay yourself first, plan for the long run, and walk out with a financial-plan outline ready for a fee-only advisor.",
    format: "90 minutes · live, small group",
    covers: [
      "Paying yourself first — and how much",
      "Separating business and personal finances for the long run",
      "Retirement when you're the boss — the lay of the land",
      "What to bring to a fee-only advisor"
    ],
    walkout: "A financial-plan outline ready for a fee-only advisor.",
    booking: "https://cal.com/quintaandco/financial-planning",
    disclaimer: "Educational only — not financial, investment, or legal advice. Consult a fee-only advisor."
  },
  {
    slug: "estate-succession", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Established",
    name: "Estate & succession planning",
    desc: "What happens to your business if something happens to you? Make the plan — wills, beneficiaries, and who could step in — so the answer is never \"nobody knows.\"",
    format: "90 minutes · live, small group",
    covers: [
      "What happens to an LLC (or sole prop) when its owner can't run it",
      "Wills, beneficiaries, and powers of attorney — the business edition",
      "Succession basics: who could step in, and what they'd need from you",
      "The one-page \"if something happens\" file every owner should keep"
    ],
    walkout: "A one-page business continuity file, and a checklist ready to bring an estate attorney.",
    prereq: "Nothing — pairs well with Financial planning.",
    booking: "https://cal.com/quintaandco/estate-succession",
    disclaimer: "Educational only — not legal advice. Confirm your plan with an estate attorney."
  },
  {
    slug: "trademarks", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Up and running",
    name: "Trademarks",
    desc: "Learn what a trademark actually protects, search properly before you fall in love with a name, and leave knowing whether filing is worth it for you.",
    format: "90 minutes · live, small group",
    covers: [
      "Trademarks vs. LLC names vs. domains — what each one actually protects",
      "How to search properly before you commit to a name",
      "When a DIY federal filing makes sense — and when to hire an attorney",
      "Keeping your mark alive once you have it"
    ],
    walkout: "A search-and-file roadmap for your business name.",
    booking: "https://cal.com/quintaandco/trademarks",
    disclaimer: "Educational only — not legal advice. Confirm your filing with a trademark attorney."
  },
  {
    slug: "funding", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Established",
    name: "Funding",
    desc: "Map the funding that's realistic for your stage — and tell the real grants from the scams.",
    format: "90 minutes · live, small group",
    covers: [
      "The funding realistic for your stage (grants, loans, lines of credit)",
      "Telling real grants from scams",
      "What lenders and grantors actually look for"
    ],
    walkout: "A map of funding options that fit your stage.",
    booking: "https://cal.com/quintaandco/funding"
  },
  {
    slug: "brand-101", track: "foundations", phase: "Build to last", phaseNum: "03", stage: "Up and running",
    name: "Brand 101",
    desc: "Walk out with a one-page brand foundation — your promise, your voice, and a simple visual direction — so every future decision gets easier, no agency required.",
    format: "90 minutes · live, small group",
    covers: [
      "Your promise: what you stand for, and to whom",
      "Your voice: how you sound, consistently",
      "A simple visual direction — no agency required",
      "Using your brand to make future decisions easier"
    ],
    walkout: "A one-page brand foundation.",
    booking: "https://cal.com/quintaandco/brand-101"
  },

  /* ---------- THE PRACTICE ---------- */

  {
    slug: "coffee", track: "practice", phase: null, phaseNum: null, stage: "Just starting",
    url: "coffee.html",   // Coffee has its own page (not class.html?c=coffee)
    name: "Coffee with Quinta",
    desc: "A free hour to build one small, working tool with Claude — right on your phone, start to finish. The easiest way to see what's possible.",
    format: "60 minutes · free · live, small group · monthly",
    covers: [
      "What AI can actually do for a small business (no hype)",
      "Building one small, working tool together — on your phone",
      "How to keep going after the hour"
    ],
    walkout: "One small, working tool, built start to finish.",
    prereq: "Nothing. Just bring coffee.",
    booking: "https://cal.com/quintaandco/coffee",
    free: true
  },
  {
    slug: "module-1", track: "practice", phase: null, phaseNum: null, stage: "Just starting",
    name: "Module 1 — Claude for beginners",
    desc: "Your first real session: what Claude is, how to talk to it, and how to put it to work for your business that same day.",
    format: "60 minutes · live, small group",
    covers: [
      "What Claude is, and how to talk to it",
      "Prompts that get useful results for real work",
      "Putting it to work on a task from your business that same day"
    ],
    walkout: "A workflow you'll actually keep using.",
    prereq: "Nothing — start here.",
    booking: "https://cal.com/quintaandco/module-1"
  },
  {
    slug: "module-2", track: "practice", phase: null, phaseNum: null, stage: "Up and running",
    name: "Module 2 — Build your AI assistant",
    desc: "Go from chatting with Claude to building an assistant that handles a real, repeatable task in your business.",
    format: "90 minutes · live, small group",
    covers: [
      "Moving from chatting to a repeatable assistant",
      "Giving Claude the context of your business",
      "Automating one real, recurring task"
    ],
    walkout: "An AI assistant that handles a real task in your business.",
    prereq: "Comfortable with the Module 1 basics. A Claude Pro subscription is recommended.",
    booking: "https://cal.com/quintaandco/module-2"
  },
  {
    slug: "module-3", track: "practice", phase: null, phaseNum: null, stage: "Established",
    name: "Module 3 — Real databases & automation",
    desc: "Add a real database and a little automation so your tools start running quietly in the background — keeping track of things and handling the busywork without needing you.",
    format: "120 minutes · live, small group",
    covers: [
      "Adding a real database — a proper home for your customers, orders, or notes",
      "Light automation so routine steps happen on their own",
      "Connecting the tools you built in Modules 1 and 2 into one workflow",
      "Knowing what's safe to automate — and what to keep an eye on"
    ],
    walkout: "A connected tool that keeps track of your work and runs quietly in the background.",
    prereq: "Built an assistant in Module 2 (or equivalent). A Claude Pro subscription is recommended.",
    booking: "https://cal.com/quintaandco/module-3"
  }

  /* ============================================================
     TEMPLATE — HOW TO ADD A NEW CLASS

     When a new class is ready (for example, the trademark class a
     friend offered to teach), copy the block below, remove the //
     at the start of each line, and fill in the blanks. Add a comma
     after the "}" of the class above this one.

     - slug:     lowercase, words-joined-by-dashes, no spaces. This
                 becomes the web address AND the Cal.com link, so it
                 must match the Cal.com event you create.
     - track:    "foundations" or "practice"
     - phase/phaseNum: Foundations only. Use one of the existing
                 phases: "Start right"/"01", "Keep the books"/"02",
                 "Build to last"/"03". (For Practice, set both to null.)
     - covers/walkout/prereq: the syllabus (see classes above).
     - free/soon: delete these lines unless the class is free or
                 still in development.

  // ,{
  //   slug: "trademark", track: "foundations", phase: "Build to last", phaseNum: "03",
  //   name: "Trademarks",
  //   desc: "WRITE ONE PLAIN-ENGLISH SENTENCE HERE — what they learn and what they walk out with.",
  //   format: "90 minutes · live, small group",
  //   covers: ["First thing we cover", "Second thing", "Third thing"],
  //   walkout: "The tangible thing they leave with.",
  //   booking: "https://cal.com/quintaandco/trademark",
  //   disclaimer: "Educational only — not legal advice. Confirm with an attorney."
  // }
     ============================================================ */
];

/* Helpers used by app.js */
function quintaByTrack(track){ return QUINTA_CLASSES.filter(function(c){ return c.track === track; }); }
function quintaBySlug(slug){ return QUINTA_CLASSES.find(function(c){ return c.slug === slug; }) || null; }
