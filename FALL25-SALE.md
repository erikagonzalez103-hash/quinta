# Fall flash sale — 25% off

Everything the sale touches, and how to switch it off. Read the last section
first if you are here to *end* the sale.

---

## The part only you can do: Cal.com

Cal.com has **no discount-code field**. Its Stripe integration charges a fixed
payment intent rather than opening a Stripe Checkout session, so Stripe's own
coupon machinery never gets a turn. (Open feature request since Nov 2023:
`calcom/cal.diy#12462`.) That is why the codes below are share links, not
something a student types.

So the discount has to be set **on each Cal.com event type by hand**. Until you
do this, the website advertises a sale price and Cal.com still charges full
price — the exact mismatch `classes.js` warns about.

For each class: Cal.com → Event Types → the event → **Apps → Stripe → Price**.

| Cal.com event | List | **Set to** |
|---|---|---|
| `entity-setup` | $175 | **$131** |
| `bookkeeping-2` | $99 | **$74** |
| `certification` | $299 | **$224** |
| `financial-planning` | $250 | **$187** |
| `legacy-planning` | $299 | **$224** |
| `trademarks` | $299 | **$224** |
| `brand-101` | $175 | **$131** |
| `module-1` | $150 | **$112** |
| `module-2` | $200 | **$150** |

Every figure is 25% off, rounded **down** to a whole dollar — the site's prices
are whole dollars by convention, and rounding down never overcharges.

---

## The codes

Each link tags the booking with the teacher who sent it, so the Swarm board
credits her. Give each teacher her own link:

| Code | Link to share |
|---|---|
| ERIKAFALL25 | `quintaand.co/go/erikafall25` |
| STEPHANIEFALL25 | `quintaand.co/go/stephaniefall25` |
| NERYFALL25 | `quintaand.co/go/neryfall25` |
| JOSHLYNFALL25 | `quintaand.co/go/joshlynfall25` |
| NIKFALL25 | `quintaand.co/go/nikfall25` |
| TARAFALL25 | `quintaand.co/go/tarafall25` |

**The code is the name of the link, not a second attribution system.** Each one
redirects to `/fall25/?ref=<firstname>26` — the ref codes the faculty
leaderboard already counts. The board joins on `firstname || '26'`
(`supabase/sql/2026-08-24-campaign-swarm-board.sql`), so a booking tagged
`erikafall25` would be credited to nobody. If you ever add a teacher, her code
must keep pointing at her existing `<firstname>26` ref.

---

## Three things to know

- **Nery has no class in the sale.** Insurance is her only class and it is on
  waitlist — no dates, no Book button. NERYFALL25 works and credits her for
  anything her audience books, but she has nothing of her own to sell. When she
  sets dates, add `salePrice: 131` to `insurance` in `classes.js` and set $131
  on the Cal.com event.
- **Bookkeeping I is not in the sale** — still on waitlist while Tara builds it.
  Bookkeeping II is, at $74.
- **Module 1 at $112 is below the HERHOUSE rate** ($112.50, promised "through
  December" on `/herhouse/`). During the sale a HERHOUSE tag is worth nothing
  extra. Nothing breaks; just don't be surprised if someone asks.

---

## The faculty social kit still quotes list prices

`faculty/final-push-data.js` is a *different* campaign, and its captions have
prices written into the prose ("$299 · Kiln · one focused class"). It has been
left alone on purpose: changing the `price` field without rewriting nine
captions would leave the two contradicting each other. If the faculty are
posting those captions during the sale, the captions need rewriting by hand —
a copy decision, not a code one.

---

## To end the sale

1. **In `classes.js`** — delete the nine `salePrice:` lines (each is marked
   `// Fall flash sale — DELETE this line to end the sale`). List prices were
   never overwritten, so there is nothing to restore and nothing to look up.
   The site reverts everywhere at once and `/fall25/` empties itself.
2. **In Cal.com** — put the nine Stripe prices back to the **List** column
   above. This is the step that actually stops the discount. Missing it means
   you are quietly selling at 25% off forever.
3. Optionally delete `/fall25/` and the six `go/*fall25/` folders.

Do step 2 even if you skip everything else.
