# ADR-024: Admin Shops

## Status
**Implemented** - 2026-11

## Context

The shops Worker appends the server's own shops (the spawn villagers) to the
player shop list. They come from a separate mapper API whose domain is a Worker
secret. They have the same schema as player shops, with a few differences:

- Every admin shop has the owner **`Server Admins`**. The Worker renames the
  mapper's `##ADMIN##`. The space means no player can have this name.
- About 33 shops and 198 trades. Most are around spawn (x −250…−100,
  z −170…170), and several are 1–7 blocks apart. Two are at x ≈ −20,
  z ≈ −160, one is far out at (−2857, 2828), and one is in the Nether.
- `stock` is a placeholder (93313 on every trade): the stock is unlimited.
- Items often have no display name. Many carry lore or enchantments (vouchers,
  certificates, named gear), and costs include custom items such as a
  "Playtime Certificate" book. Two shops have no trades.

Players want to see "what the server itself sells" apart from player shops,
and also to leave it out.

## Decision

### 1. A "who", not a "what": the existing shop filter

Lenses are item categories (ADR-023). Admin shops are a seller, so they are
the owner filter `{ owner: 'Server Admins' }` (`?owner=Server+Admins`), with no
new lens. The owner name is `ADMIN_SHOP_OWNER` in `src/constants.ts`. The
Worker keeps its own copy, because it can't import from `src`, and a comment
there says the two must match.

- **Show them**: a pinned **Admin shops** row under "Sold by" in the Buying
  menu. It is picked in place like a category, its pill reads "Admin shops",
  and it uses the URL, Back/Forward and Backspace like any shop filter. Typing
  "admin" also finds the owner.
- **Hide them**: a trade filter **Hide admin shops** (pill "No admin shops",
  `filters=noadmin`, Alt+5). It combines with every other filter.
- The two exclude each other (`withShop` / `withFilter` in `search/scope.ts`).
  Picking the admin shops turns off "Hide admin shops", and turning that on
  drops an admin shop filter. A URL with both keeps the shop filter.
- Both rows only appear when the data has admin shops; localhost data has
  none. "Hide admin shops" also stays visible while it is on, so it can be
  turned off.

### 2. Stock is unlimited, not plentiful

`getRealStock()` (`search/shop-filter.ts`) returns `undefined` for admin shops.

- The Stock column shows **∞** with the tooltip "Admin shop: unlimited stock".
- Sorting by stock puts admin shops last in both directions, like trades
  without a deviation in the Deal sort.
- In Best per item, stock only breaks a tie when both stocks are real.
- Flips keep the placeholder as a use limit, because the stock really is
  unlimited.

### 3. Valuation: unchanged

All admin shops share one owner, so they already count as **one independent
shop** (ADR-001). Their prices stay in the medians and in the currency graph.
An admin price is a real price that every player can always get: if the
server sells trial keys for 1 diamond, a player shop asking 4 is a bad deal.

Checked on the 2026-11-28 data (4,702 player trades in stock plus the 198
admin trades):

| | Without admin shops | With admin shops |
|---|---|---|
| Currency quotes (diamond, netherite, blocks) | — | identical |
| Flips | 158 | 158, none with an admin shop |
| Player trades with a deal ≤ −75% | 134 | 135 |
| Player trades whose deviation moves ≥ 10 points | — | 16 (trial keys, potatoes, wheat) |
| Admin trades with a confident deviation | — | 26 of 198, none a deal |

The trades that move are items the server sells itself, and they move toward
the price players can always pay. Excluding admin shops from the medians would
hide that. "Hide admin shops" covers players who want only player shops.

### 4. Display

The owner stays plain text, rendered through lit or `textContent` and never
as HTML. Admin is marked where it costs nothing:

- the distance tooltip: "Bimbus (admin shop)";
- the map card: "Bimbus · Admin shop";
- the map dot tooltip: "Bimbus · admin shop".

The cart, the flips panel and the route show the shop name like any other
shop.

## Alternatives considered

- **An "Admin" lens.** It mixes who with what, and it would need item rules
  for a seller.
- **A dedicated tri-state control (all / only / none).** It would be a new
  control next to the menus that ADR-023 already settled on, and the two
  existing mechanisms cover it.
- **Leaving admin shops out of valuation.** The data above shows no harmful
  effect, and they are real prices.
- **Hiding admin shops by default.** That would surprise players looking for
  the cheapest source of an item the server sells.

## Consequences

- On the first visit after the Worker change, the dashboard lists the admin
  trades as new once.
- Navigation auto-advances a stop within 8 blocks (`ARRIVAL_THRESHOLD`). With
  several admin shops 1–7 blocks apart, a route through them completes them
  one per position update. That already happened in dense player areas.
- Local development and the E2E tests add admin shops through fixtures
  (`tests/helpers/admin-shop-mocks.ts`, ADR-003). `public/admin-shops.json`
  is a gitignored local sample.
