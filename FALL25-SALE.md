# Fall flash sale — 25% off

## The one thing to know

Who is on sale is decided in **one list**, in `config.js`:

```js
SALE: {
  PERCENT_OFF: 25,
  CLASSES: [
    "entity-setup",
    "certification",
    "module-1",
    "module-2"
  ]
}
```

A class in the list is on sale. A class not in it is at full price. The
discounted figure is worked out from `PERCENT_OFF` — 25% off, rounded **down**
to a whole dollar — so there is never a second number to keep in step, and
rounding down never overcharges.

Right now that is **Erika's four classes only**. Nobody else is discounted
until she says so; the 25% comes out of Erika's cut.

---

## Turning a teacher on when she emails back

**Two steps. Both are needed.**

1. **Add her class's slug** to `SALE.CLASSES` in `config.js`, and commit.
   *This changes what the website advertises.*
2. **Run the prices job.** *This changes what Cal.com charges.*

Do only step 1 and the site promises a discount Cal.com will not honour.

### Running the prices job without a terminal

GitHub → **Actions** → **"Sale prices → Cal.com"** → **Run workflow**

- **mode:** `sale` to put discounts on, `list` to take them off
- **apply:** leave **unticked** the first time. It prints exactly what it would
  change and changes nothing. Read that, then run again with it ticked.

### Or from a terminal

```
export CAL_API_KEY=cal_live_...              # your own machine only
node tools/set-sale-prices.mjs --sale        # dry run
node tools/set-sale-prices.mjs --sale --apply
```

### The slugs, and who teaches what

| Slug | Teacher | List | Sale |
|---|---|---|---|
| `entity-setup` | Erika | $175 | $131 |
| `certification` | Erika | $299 | $224 |
| `module-1` | Erika | $150 | $112 |
| `module-2` | Erika | $200 | $150 |
| `bookkeeping-2` | Tara | $99 | $74 |
| `brand-101` | Stephanie | $175 | $131 |
| `financial-planning` | Joshlyn | $250 | $187 |
| `legacy-planning` | Nik | $299 | $224 |
| `trademarks` | Nik | $299 | $224 |
| `insurance` | Nery | $175 | $131 |

`insurance` needs dates set before it goes in the list — a discount on a class
with no dates sells a seat that does not exist. `bookkeeping-1` is still on
waitlist while Tara builds it.

---

## The API key

`CAL_API_KEY` is a bearer token for the whole booking calendar — anyone holding
it could read student names and emails, or cancel bookings. **This repository
is public.** It never goes in a file here.

**Get it:** Cal.com → Settings → Developer → API keys → **+ Add**. Copy it when
it is shown; it is not shown again.

**Put it where it is needed:**

| To run it from | Where the key goes |
|---|---|
| GitHub Actions (the button above) | Repo **Settings → Secrets and variables → Actions → New repository secret**, named `CAL_API_KEY` |
| Your own laptop | `export CAL_API_KEY=cal_live_...` in Terminal — lasts only for that window |
| The schedule-sync Worker | Already done: `wrangler secret put CAL_API_KEY` |

Do **not** paste it into a chat, a commit, or any file in this repo.

---

## Why the codes are links, not something to type

Cal.com has **no discount-code field**. Its Stripe integration charges a fixed
payment intent rather than opening a Stripe Checkout session, so Stripe's own
coupon machinery never gets a turn (`calcom/cal.diy#12462`, open since 2023).
The HERHOUSE code worked the same way: a word on a page in front of a
discounted event, never something anyone typed.

| Code | Link to share |
|---|---|
| ERIKAFALL25 | `quintaand.co/go/erikafall25` |
| STEPHANIEFALL25 | `quintaand.co/go/stephaniefall25` |
| NERYFALL25 | `quintaand.co/go/neryfall25` |
| JOSHLYNFALL25 | `quintaand.co/go/joshlynfall25` |
| NIKFALL25 | `quintaand.co/go/nikfall25` |
| TARAFALL25 | `quintaand.co/go/tarafall25` |

**Don't send a teacher her code until she has opted in.** All six work and
credit correctly, but a teacher promoting her own code while her class sits at
full price is an awkward thing to have done to her.

**The code is the name of the link, not a second attribution system.** Each
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
  prices written into the prose ("$299 · Kiln · one focused class"). Left alone
  on purpose: changing the `price` field without rewriting nine captions would
  leave the two contradicting each other. If the faculty post that kit during
  the sale, the captions need rewriting by hand.

---

## To end the sale

1. **Run the prices job with mode `list` and apply ticked.** This is the step
   that actually stops the discount.
2. **Empty `SALE.CLASSES` to `[]`** in `config.js`. The site reverts everywhere
   at once and `/fall25/` empties itself. List prices in `classes.js` were never
   overwritten, so there is nothing to restore and nothing to look up.
3. Optionally delete `/fall25/` and the six `go/*fall25/` folders.

The order does not matter. `--list` deliberately covers **every** sellable
class, not just the ones still in the sale list, so emptying the list first
cannot strand Cal.com on sale prices.
