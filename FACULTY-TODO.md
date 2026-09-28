# Faculty to-do — running list

What we need from the faculty, in priority order. Nothing here has been sent
yet. Add to it as things come up; when it's ready to go out, it becomes the
email.

Last checked against Cal.com: **28 September 2026**.

---

## 1. October and November dates — blocks everything

**Five of the six classes the site advertises as bookable have no dates in
Cal.com.** September's dates have been used or have passed, and only Nik has
put October dates in. Until this is fixed the Fork, Femme & Foundations sale
has almost nothing it can actually sell.

| Instructor | Class | Site says | Cal.com has | Needs |
|---|---|---|---|---|
| Erika | Get certified — WBE / MBE / DBE | Bookable | none | **dates** |
| Tara | Bookkeeping II | Bookable | none | **dates** |
| Joshlyn | Investing — how to pay yourself first | Bookable | none | **dates** |
| Stephanie | Brand 101 | Bookable | none | **dates** |
| Nik | Trademarks | Bookable | none | **dates** |
| Nik | Legacy planning | Bookable | 3 slots from 28 Oct | ✅ done |
| Erika | Module 1 — Claude for beginners | *Coming soon* | 1 slot, 13 Oct | flip `open: true` in `classes.js` |
| Tara | Bookkeeping I | *Coming soon* | none | **dates** — open since 11 Sept |
| Erika | Modules 2 and 3 | *Coming soon* | none | **dates** |

### Why it matters this week

- The sale runs **29 September – 21 October**. Every day without dates is a
  day the campaign spends traffic on classes nobody can book.
- A click from `foundations.html` or `fork-femme-foundations.html` lands on a
  Cal.com page with no times on it. That is the exact failure
  `FALL25-SALE.md` warns about: *a sale link with no bookable slot strands
  exactly the people your code brought.*
- **Build to last ($990) cannot be redeemed.** Four of its five classes have
  no dates, so a buyer would pay and have nothing to book. The bundle twin
  `build-to-last-fff` is built correctly and shows zero slots for this reason
  alone — it inherits availability from Get certified, which is empty.

### What each of them actually does

Sign in to the portal → **Set your class schedule** → add dates → save. It
syncs to Cal.com within seconds and the site corrects itself. Same flow they
used in September; no new instructions needed.

### Two things to decide before this goes out

- **How far ahead to ask for.** The event is 21 October but redemption runs
  across the semester, so dates through at least December make the bundles
  worth buying.
- **Module 1 is the reverse problem** — it has a 13 October slot and the site
  says coming soon. That is a one-line fix in `classes.js`, not something to
  ask an instructor for. Worth doing regardless of the rest.

---

## 2. Nik — three decisions, and they interact

### a. Which class she teaches on 21 October

Trademarks *or* Legacy planning, whichever she'd rather teach on the day.
Both are $299 and both sit in Build to last. Legacy planning already has
dates; Trademarks has none.

### b. The Austin Fork & Femme dinner — which night

Nik is hosting it. The plan has always had two dinners, Dallas and Austin,
as separate events with separate hosts — Austin is now claimed, Dallas is
still open.

**The ask: hold it a day or two either side of 21 October rather than on
it.** A day before builds toward the Dallas day; a day after gives people
somewhere to land afterwards. On the night of the 21st it competes with our
own wrap.

### c. Would she come up to Dallas on the 21st?

The real prize. Having her in the room on the day makes it a bigger splash,
and the more of the faculty physically there, the more it reads as one event
rather than several. (Joshlyn is *planned* to come up from Houston — see 3 —
but that isn't confirmed, so don't use it as the reason when asking Nik.)

**This is why (b) and (c) have to be decided together.** If she's in Dallas
on the 21st, the Austin dinner can't be that evening — she'd be driving
back. Asking her to pick the dinner date without knowing whether we want
her in Dallas risks locking in the one night that rules the other out.

Worth saying plainly when we ask: **coming to Dallas is an invitation, not
an expectation.** Teaching online is the floor. Nobody outside Dallas is
being asked to travel.

One scheduling note to check with her: she already has Legacy planning
dates on **28 October**, a week after. That's clear of all of this, but
worth confirming she isn't stacking three commitments in eight days.

---

## 3. Confirmations for the day itself

The original 18 September deadline passed with no record here of who
confirmed. Before class titles can go on anything printed, we need to know
who is teaching what on 21 October, and in which block.

Open in the plan doc as of 2 September, still open:

- Which classes run in which block, and which repeat
- Breakfast and lunch vendors — two woman-owned food businesses, both TBD
- ~~Dinner hosts~~ — **both claimed.** Austin is Nik's (see 2b), Dallas is
  Erika's. Venues still TBD for each.
- **Joshlyn's travel is unconfirmed.** The plan doc says she "comes up from
  Houston so the day lands as one big splash" and that she is "traveling from
  Houston for the in-person day" — but that was written on 2 September as a
  plan, and nobody has recorded her agreeing to it. Ask before it is repeated
  anywhere public or used to encourage anyone else to travel.

---

## 4. Entity setup needs an instructor

No instructor since **17 September**, when Erika stepped off it — choosing an
entity is a tax question and should be taught by a tax professional. Her tax
strategist was being asked to take it.

Until it has one:

- It stays off `fork-femme-foundations.html`
- It is no longer in any bundle. **Get started was rebuilt around Bookkeeping I**
  on 28 September precisely because of this — see 5.

---

## 5. Get started changed and nothing wrote it down

Erika confirmed on 28 September that **Get started is Bookkeeping I +
Module 1**, not Entity setup + Module 1. Almost certainly a consequence of
Entity setup losing its instructor on 17 September.

The site is now correct. Three other places are not:

- `Desktop/Quinta and Co/Marketing/fork-and-femme-event.pdf` (2 September) still
  says Entity Setup + Module 1 at $325 / $275
- The faculty meeting deck of 23 September carries $275 with no contents listed
- Any printed or posted artwork built from either

**The price had to move with it.** Entity setup ($175) + Module 1 ($150) was
$325, so $275 was a fair 15% off. Bookkeeping I ($99) + Module 1 ($150) is
**$249** — at which point $275 was $26 *more* than buying the two classes
separately. It is now **$199**, a 20% saving, and the cheapest way into both
tracks at once.

Worth fixing the PDF and the deck before either is sent anywhere again.

---
## Not faculty, but blocking the same campaign

- ~~**Get Certified price mismatch**~~ — **closed 28 September.** The artwork
  said $299 against $250 in Cal.com. Cal.com now charges $299 and every class
  price matches the site exactly (checked: Bookkeeping II $99, Get certified
  $299, Investing $250, Legacy planning $299, Trademarks $299, Brand 101 $175,
  Module 1 $150). Nothing to do.
- **`docs/cal-api-key.txt` is still on disk.** Meant to be revoked when the
  schedule-sync work finished in August. Gitignored, so it never reached
  GitHub, but it is a live key two months past its usefulness.
