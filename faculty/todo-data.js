/* ============================================================
   FACULTY TO-DO — the tasks themselves.

   Edit this file to change the list. Nothing here is in the
   database, so adding or rewording a task never needs a
   migration — only the ANSWERS are stored.

   Each task:
     key     stable id. NEVER change it once it has been used —
             it is what an answer is filed under. Rewording the
             title is fine; changing the key orphans the answer.
     who     array of first names (lowercase) it applies to.
             Leave it out and it applies to everyone.
     title   the ask, in one line
     detail  why, or what "done" looks like
     type    "check"  a box to tick
             "answer" a text box
             "both"   a box and a text box
     due     optional, shown as a chip
   ============================================================ */

const QUINTA_FACULTY_TASKS = [
  {
    key: "oct21-session",
    title: "Add your October 21 class to the schedule",
    detail:
      "Open My classes, pick Wednesday, October 21, choose 10am, 1pm or 3pm, " +
      "and say whether you're in the room at kiln or online. Until it's there, " +
      "nobody can book your class that day and your poll link can't send people " +
      "to it. If you tried before and the portal wouldn't take the date, that " +
      "was our rule, not you, and it's fixed now.",
    type: "check",
    due: "This week"
  },
  {
    key: "oct-nov-dates",
    title: "Put your October and November dates in",
    detail:
      "This one is blocking everything else. Five of the six classes the site " +
      "advertises as bookable have no dates in Cal.com right now, so the sale " +
      "has almost nothing it can actually sell. Set your class schedule in the " +
      "portal and it reaches Cal.com within seconds. Dates through December are " +
      "ideal — the bundles are redeemable until June 30, 2027, so the further " +
      "ahead you go, the more of them are worth buying.",
    type: "both",
    due: "This week"
  },
  {
    key: "teaching-on-the-day",
    title: "Confirm what you're teaching on 21 October",
    detail:
      "One class minimum. If you teach more than one topic, tell us which — or " +
      "take two slots if you want them. If you teach more than one, the most " +
      "beginner-level goes first, so someone can start at the beginning and " +
      "stay all day.",
    type: "both"
  },
  {
    key: "block-preference",
    title: "Which block suits you — 10am, 1pm or 3pm?",
    detail:
      "Three teaching blocks, concurrent classes in separate rooms, live in " +
      "Dallas and online at the same time. Tell us your preference and any time " +
      "you absolutely can't do.",
    type: "answer"
  },
  {
    key: "own-zoom",
    title: "You're running your own Zoom",
    detail:
      "Every class is live online as well as in the room, and each instructor " +
      "handles her own link and her own room. We don't have anyone with the " +
      "bandwidth to run them centrally yet. Tick this once your link is ready.",
    type: "check"
  },

  /* ---------- person-specific ---------- */
  {
    key: "nik-which-class",
    who: ["nik"],
    title: "Trademarks or Legacy planning on the 21st?",
    detail:
      "Whichever you'd rather teach. Both are $299 and both sit in Build to " +
      "last. Legacy planning already has dates in; Trademarks has none yet.",
    type: "answer"
  },
  {
    key: "nik-dallas-on-the-day",
    who: ["nik"],
    title: "Would you come up to Dallas on 21 October?",
    detail:
      "An invitation, not an expectation — teaching online is the floor and " +
      "nobody outside Dallas is asked to travel. But the more of us in the room, " +
      "the more the day reads as one event rather than several. Answer this one " +
      "before picking the Austin dinner date, because the two interact.",
    type: "answer"
  },
  {
    key: "nik-austin-dinner",
    who: ["nik"],
    title: "Which night for the Austin Fork & Femme dinner?",
    detail:
      "A day or two either side of the 21st works better than the night " +
      "itself — a day before builds toward the Dallas day, a day after gives " +
      "people somewhere to land. If you're coming to Dallas on the 21st it " +
      "can't be that evening. Note you already have Legacy planning on the " +
      "28th, so tell us if that week is getting crowded.",
    type: "answer"
  },
  {
    key: "joshlyn-travel",
    who: ["joshlyn"],
    title: "Are you coming up to Dallas for the day?",
    detail:
      "The plan has assumed you'd travel up from Houston for the 21st, but we " +
      "never actually asked you — so we're asking. Entirely optional; teaching " +
      "online from Houston is completely fine and nothing depends on you making " +
      "the drive.",
    type: "answer"
  }
];
