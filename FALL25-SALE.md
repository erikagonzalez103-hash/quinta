# Fall flash sale — 25% off

Everything the sale touches, and how to switch it off. Read **To end the sale**
first if that is why you are here.

---

## Who is in the sale

Only **Erika's own classes**, until each teacher confirms she wants in. The
discount comes out of Erika's cut, so nobody else's class gets discounted
without her say-so.

Everyone else's classes stay **bookable at full price** — nothing is hidden,
nothing is withdrawn. They simply don't appear on `/fall25/` and don't show a
"was $175".

| Cal.com event | Teacher | List | **Sale** |
|---|---|---|---|
| `entity-setup` | Erika | $175 | **$131** |
| `certification` | Erika | $299 | **$224** |
| `module-1` | Erika | $150 | **$112** |
| `module-2` | Erika | $200 | **$150** |

> `module-1` is assumed to be Erika's — it sits in The Practice with Module 2,
> which `faculty/final-push-data.js` records as hers, and `/herhouse/` sold it
> as a Quinta offer. It is the one row here not confirmed by a record. If it
> is someone else's, delete its `salePrice` line in `classes.js`.

Every figure is 25% off, rounded **down** to a whole dollar — the site's prices
are whole dollars by convention, and rounding down never overcharges.

### When a teacher opts in

Add her `salePrice` to `classes.js` and re-run the script. The numbers are
already worked out:

| Cal.com event | Teacher | List | Sale |
|---|---|---|---|
| `bookkeeping-2` | Tara | $99 | $74 |
| `brand-101` | Stephanie | $175 | $131 |
| `financial-planning` | Joshlyn | $250 | $187 |
| `legacy-planning` | Nik | $299 | $224 |
| `trademarks` | Nik | $299 | $224 |
| `insurance` | Nery | $175 | $131 | — *only once she has dates* |

`bookkeeping-1` is not listed: still on waitlist while Tara builds it.

---

## Setting the prices in Cal.com

Cal.com has **no discount-code field**. Its Stripe integration charges a fixed
payment intent rather than opening a Stripe Checkout session, so Stripe's own
coupon machinery never gets a turn (`calcom/cal.diy#12462`, open since 2023).
That is why the codes are share links, not something a student types — and why
the discount has to be set on each Cal.com event type.

**The script does it:**

```
export CAL_API_KEY=cal_live_...              # never commit this
node tools/set-sale-prices.mjs --sale        # dry run — shows what would change
node tools/set-sale-prices.mjs --sale --apply
```

It reads `classes.js`, so the site and Cal.com cannot disagree. It is a dry run
unless you pass `--apply`, and it refuses rather than guesses: it will not make
a free class paid, will not touch a class whose Stripe app is off, and will
stop if Cal.com's current price matches neither the list price nor the sale
price — because that means someone changed it in the dashboard and one of the
two numbers is wrong.

**By hand instead:** Cal.com → Event Types → the event → **Apps → Stripe →
Price**, using the table above.

Until this is done the website advertises a sale price and Cal.com still
charges full price — the exact mismatch `classes.js` warns about.

---

## The codes

Each link tags the booking with the teacher who sent it, so the Swarm board
credits her:

| Code | Link to share |
|---|---|
| ERIKAFALL25 | `quintaand.co/go/erikafall25` |
| STEPHANIEFALL25 | `quintaand.co/go/stephaniefall25` |
| NERYFALL25 | `quintaand.co/go/neryfall25` |
| JOSHLYNFALL25 | `quintaand.co/go/joshlynfall25` |
| NIKFALL25 | `quintaand.co/go/nikfall25` |
| TARAFALL25 | `quintaand.co/go/tarafall25` |

**Don't send a teacher her code until she has opted in.** All six links work and
credit correctly, but a teacher promoting her own code while her own class sits
at full price is an awkward thing to have done to her. Erika's is ready now.

**The code is the name of the link, not a second attribution system.** Each one
redirects to `/fall25/?ref=<firstname>26` — the ref codes the faculty
leaderboard already counts. The board joins on `firstname || '26'`
(`supabase/sql/2026-08-24-campaign-swarm-board.sql`), so a booking tagged
`erikafall25` would be credited to nobody.

---

## Two other things

- **Module 1 at $112 is below the HERHOUSE rate** ($112.50, promised "through
  December" on `/herhouse/`). During the sale a HERHOUSE tag is worth nothing
  extra. Nothing breaks; just don't be surprised if someone asks.
- **The faculty social kit still quotes list prices.**
  `faculty/final-push-data.js` is a different campaign and its captions have
  prices written into the prose ("$299 · Kiln · one focused class"). It was left
  alone on purpose: changing the `price` field without rewriting nine captions
  would leave the two contradicting each other. If the faculty are posting that
  kit during the sale, the captions need rewriting by hand.

---

## To end the sale

1. **Cal.com** — `node tools/set-sale-prices.mjs --list --apply`. This is the
   step that actually stops the discount. Do it even if you skip the rest.
2. **`classes.js`** — delete the `salePrice:` lines (each is marked
   `// Fall flash sale — DELETE this line to end the sale`). List prices were
   never overwritten, so there is nothing to restore and nothing to look up.
   The site reverts everywhere at once and `/fall25/` empties itself.
3. Optionally delete `/fall25/` and the six `go/*fall25/` folders.

Do step 1 before step 2 — the script reads `classes.js` to know which classes
to put back, so deleting the lines first leaves it with nothing to do.
