# Fall flash sale — 25% off, for code holders only

## How it works

**Your real classes never change price.** Someone who finds Certification on
Google during the sale still pays $299.

The discount lives on a **separate, hidden Cal.com event** — a twin. Only
`/fall25/`, which people reach through a code link, points at the twin. This
is the same shape as the HERHOUSE code: `module-1-herhouse` was a second event
at a lower price, reached from a page.

It has to work this way. Cal.com has no discount-code field and no
per-customer pricing — one event, one price, for whoever books it. A second
event is the only way to charge two people differently. (There is also no API
for any of this: v1 was decommissioned, and v2's event-type input has no
price, currency or metadata field. Every step below is done by hand.)

```
someone with a code   →  /fall25/  →  cal.com/quintaandco/certification-fall25  →  $224
someone from Google   →  the class page  →  cal.com/quintaandco/certification   →  $299
```

---

## Before a single code goes out

For each class in the sale, in Cal.com:

1. **Duplicate** the real event.
2. **Name the copy `<slug>-fall25`** — exactly. The site builds the link from
   this name, so `certification-fall25` and nothing else.
3. **Set its Stripe price** to the sale figure below.
4. **Hide it** so it never appears on your public Cal.com profile. The only
   way in is the code link.
5. **Give it dates.** See the warning below. This is the step that gets
   forgotten and it is the one that strands customers.

| Twin event | Price | Real event stays |
|---|---|---|
| `entity-setup-fall25` | **$131** | $175 |
| `certification-fall25` | **$224** | $299 |
| `module-1-fall25` | **$112** | $150 |
| `module-2-fall25` | **$150** | $200 |

25% off, rounded **down** to a whole dollar — rounding down never overcharges.

### ⚠ The twins do not get dates automatically

The schedule-sync Worker finds Cal.com events by **exact slug**
(`workers/schedule-sync/worker.js:118`). It syncs `certification` and knows
nothing about `certification-fall25`. Dates set in the faculty portal reach
the real event **only**.

So every twin's dates are set by hand, and they will drift as new dates are
added to the real class. For a short sale on four classes that is a fair
trade. For a long one it is a trap.

### Pre-flight: open all four, in a private window

Before you post a code, open each and check **the price is the sale price**
and **dates are offered**:

- `cal.com/quintaandco/entity-setup-fall25` → $131
- `cal.com/quintaandco/certification-fall25` → $224
- `cal.com/quintaandco/module-1-fall25` → $112
- `cal.com/quintaandco/module-2-fall25` → $150

A 404, a full price, or an empty calendar means the code sends people to a
dead end — and it strands exactly the people your teachers brought in.

---

## The site side

One list, in `config.js`, mapping the real class to its twin:

```js
SALE: {
  PERCENT_OFF: 25,
  CLASSES: {
    "entity-setup":  "entity-setup-fall25",
    "certification": "certification-fall25",
    "module-1":      "module-1-fall25",
    "module-2":      "module-2-fall25"
  }
}
```

The sale price is worked out from `PERCENT_OFF`, so there is no arithmetic to
get wrong. The public site is untouched by this list — class pages, the hub
pages and every Book button keep showing the full price and the real event.
If a sale price ever shows up on a class page, the gate has been lost and
every organic visitor is being discounted by accident.

### When a teacher opts in

1. Build her twin in Cal.com (the five steps above).
2. Add the pair to `CLASSES` and commit.

| Class | Teacher | Twin to create | Price | Full |
|---|---|---|---|---|
| `bookkeeping-2` | Tara | `bookkeeping-2-fall25` | $74 | $99 |
| `brand-101` | Stephanie | `brand-101-fall25` | $131 | $175 |
| `financial-planning` | Joshlyn | `financial-planning-fall25` | $187 | $250 |
| `legacy-planning` | Nik | `legacy-planning-fall25` | $224 | $299 |
| `trademarks` | Nik | `trademarks-fall25` | $224 | $299 |
| `insurance` | Nery | `insurance-fall25` | $131 | $175 |

`insurance` needs dates on the real class first. `bookkeeping-1` is still on
waitlist.

---

## The codes

| Code | Link to share |
|---|---|
| ERIKAFALL25 | `quintaand.co/go/erikafall25` |
| STEPHANIEFALL25 | `quintaand.co/go/stephaniefall25` |
| NERYFALL25 | `quintaand.co/go/neryfall25` |
| JOSHLYNFALL25 | `quintaand.co/go/joshlynfall25` |
| NIKFALL25 | `quintaand.co/go/nikfall25` |
| TARAFALL25 | `quintaand.co/go/tarafall25` |

**Don't send a teacher her code until her twin exists** — a code that opens a
page not listing her class is worse than no code.

**The code is the name of the link, not a second attribution system.** Each
redirects to `/fall25/?ref=<firstname>26` — the ref codes the faculty
leaderboard already counts. The board joins on `firstname || '26'`
(`supabase/sql/2026-08-24-campaign-swarm-board.sql`), so a booking tagged
`erikafall25` would be credited to nobody.

---

## To end the sale

1. **Empty `CLASSES` to `{}`** in `config.js`. `/fall25/` empties itself.
2. **Hide or delete the twins** in Cal.com.

That is all. **Your real events were never touched, so there is no price to
put back and no way to be left quietly undercharging.** That safety is the
main reason this shape was chosen over discounting the real events.

---

## One thing to know

**Module 1 at $112 is below the HERHOUSE rate** ($112.50, promised "through
December" on `/herhouse/`). During the sale that tag is worth nothing extra.
