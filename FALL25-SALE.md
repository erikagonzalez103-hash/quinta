# Fall flash sale — 25% off

## Cal.com prices are set BY HAND. There is no API for it.

This is the important thing on this page, so it is first.

- **Cal.com API v1 was decommissioned.** Any v1 call now returns
  `410 API v1 has been decommissioned`.
- **Cal.com API v2 cannot set a price.** Its event-type create and update
  inputs (`UpdateEventTypeInput_2024_06_14`) contain no `price`, `currency`,
  `paymentOption`, `metadata` or `apps` field. The Stripe price lives in the
  event type's `metadata.apps.stripe`, and v2 does not expose metadata.
  (`calcom/cal.diy#18442` — `hidden` was since added, metadata was not.)

So there is no endpoint left to call. A script to do this was written and
removed again; the button was worse than nothing, because it looked like the
sale could be switched off with a click when it cannot. Anyone tempted to
rebuild it should check whether v2 has gained a metadata or payments field
first — that is the only thing that changed the answer.

The schedule-sync Worker is unaffected: it already speaks v2, and schedules
are something v2 does support.

### Setting a price

Cal.com → **Event Types** → the event → **Apps → Stripe → Price**.

| Cal.com event | Teacher | List | Sale |
|---|---|---|---|
| `entity-setup` | Erika | $175 | **$131** |
| `certification` | Erika | $299 | **$224** |
| `module-1` | Erika | $150 | **$112** |
| `module-2` | Erika | $200 | **$150** |

25% off, rounded **down** to a whole dollar — rounding down never overcharges.

**Two steps make a sale, and both are needed.** `config.js` changes what the
website advertises; Cal.com changes what the customer is charged. Doing one
without the other means the site promises a discount that is not honoured, or
quietly charges less than it advertises.

---

## Who is on sale

One list, in `config.js`, beside `SITE_LIVE` and `FOUNDATIONS_OPEN`:

```js
SALE: {
  PERCENT_OFF: 25,
  CLASSES: ["entity-setup", "certification", "module-1", "module-2"]
}
```

A class in the list is on sale; a class not in it is at full price. The
discounted figure is worked out from `PERCENT_OFF`, so there is no arithmetic
to get wrong and no second number to keep in step. List prices in `classes.js`
are never overwritten.

Right now that is **Erika's four classes only**. The 25% comes out of Erika's
cut, so nobody else is discounted until they say yes. Everyone else's classes
stay bookable at full price the whole time.

### When a teacher opts in

1. Add her class's slug to `SALE.CLASSES` in `config.js` and commit.
2. Set her price in Cal.com, by hand, from the table below.

| Cal.com event | Teacher | List | Sale |
|---|---|---|---|
| `bookkeeping-2` | Tara | $99 | $74 |
| `brand-101` | Stephanie | $175 | $131 |
| `financial-planning` | Joshlyn | $250 | $187 |
| `legacy-planning` | Nik | $299 | $224 |
| `trademarks` | Nik | $299 | $224 |
| `insurance` | Nery | $175 | $131 |

`insurance` needs dates set first — a discount on a class with no dates sells
a seat that does not exist. `bookkeeping-1` is still on waitlist.

---

## The codes

Cal.com has **no discount-code field**. Its Stripe integration charges a fixed
payment intent rather than opening a Stripe Checkout session, so Stripe's own
coupon machinery never gets a turn (`calcom/cal.diy#12462`). The HERHOUSE code
worked the same way: a word on a page in front of a discounted event, never
something anyone typed.

| Code | Link to share |
|---|---|
| ERIKAFALL25 | `quintaand.co/go/erikafall25` |
| STEPHANIEFALL25 | `quintaand.co/go/stephaniefall25` |
| NERYFALL25 | `quintaand.co/go/neryfall25` |
| JOSHLYNFALL25 | `quintaand.co/go/joshlynfall25` |
| NIKFALL25 | `quintaand.co/go/nikfall25` |
| TARAFALL25 | `quintaand.co/go/tarafall25` |

**Don't send a teacher her code until she has opted in** — a teacher promoting
her own code while her class sits at full price is an awkward thing to have
done to her.

**The code is the name of the link, not a second attribution system.** Each
redirects to `/fall25/?ref=<firstname>26` — the ref codes the faculty
leaderboard already counts. The board joins on `firstname || '26'`
(`supabase/sql/2026-08-24-campaign-swarm-board.sql`), so a booking tagged
`erikafall25` would be credited to nobody.

---

## Two other things

- **Module 1 at $112 is below the HERHOUSE rate** ($112.50, promised "through
  December" on `/herhouse/`). During the sale that tag is worth nothing extra.
- **The faculty social kit still quotes list prices.**
  `faculty/final-push-data.js` is a different campaign with prices written into
  its captions. Left alone on purpose: changing the `price` field without
  rewriting nine captions would leave the two contradicting each other.

---

## To end the sale

**Both steps. The Cal.com one is the one that stops the discount.**

1. **In Cal.com**, set each event's Stripe price back to its **List** figure,
   by hand, from the tables above.
2. **In `config.js`**, empty `SALE.CLASSES` to `[]`. The site reverts
   everywhere at once and `/fall25/` empties itself.

Step 2 alone stops the website advertising the sale, and leaves Cal.com
quietly charging 25% less than the site says. Step 1 is the one that matters.
