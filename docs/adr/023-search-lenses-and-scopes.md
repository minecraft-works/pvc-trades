# ADR-023: Lenses, Shops and Filters in the Search Field Menus

## Status
**Implemented** - 2026-11

## Context

Buying a themed set of items ("everything for redstone") was slow. Text search
only finds items that share a word: `coral` finds all coral, but `redstone`
misses hoppers, pistons, observers, comparators, rails and slime blocks.

The quick bar under the search fields had grown into a row of fixed toggles
(Deals, Best per item, Shulkers, New) plus a shop/owner chip. Every new
filter would have added another permanent button.

## Decision

### 1. Three kinds of scope: WHAT, WHO and HOW

Everything that narrows the results besides the typed text is one *search
scope* (`src/search/scope.ts`, held by `searchScopeStore`):

| | Question | Options | How many |
|---|---|---|---|
| **WHAT** — lens | What kind of item? | 12 built-in lenses | one per side (Buying, Paying) |
| **WHO** — shop | Who sells it? | an owner, or one of their shops | one |
| **HOW** — trade filters | Which trades are good? | Deals, Best per item, Shulkers, New | any |

All three intersect. "Redstone + ValeriaShares + Best per item" is the
cheapest offer for each redstone item in ValeriaShares' shops.

### 2. Lenses are built-in, ID-based and may overlap

`src/search/lenses.ts` defines 12 lenses: Armor, Weapons, Tools, Redstone,
Flowers, Ores & Minerals, Food, Potions, Enchanted Books, Transportation,
Music & Discs, Collectibles & Rarities.

- A lens matches on the vanilla item ID (exact IDs plus prefixes/suffixes such
  as `_pickaxe`), never on the display name, so renamed items still count.
- An item can be in several lenses (elytra: Armor, Transportation,
  Collectibles). Overlap is fine because a lens is a view, not a category tree.
- A filled shulker box counts by its contents (any item inside matches).
- Lenses don't try to cover everything. On the 2026-11-27 data the 12 lenses
  cover 330 of 769 distinct items (53% of trades); building blocks, nature
  and mob drops stay reachable by typing.
- There are no user-defined lenses. Fixed presets keep the menu short, the URL
  shareable and the definitions testable.

### 3. One picker per field: the field's own menu

There are no new buttons. Each search field is the picker for its side:

- **Click Buying or press Alt+↓** to open its menu. It starts with the
  lens grid under "Categories", then *Shops & owners ›* under "Sold by" (a
  browsable list of all owners and shops), then the filters.
- **Click Paying** to open its menu: the same "Categories" grid, and nothing
  else.
- Categories and filters are picked in place: the menu stays open, so a
  category and a filter (Food + Deals) take one menu visit. A field has one
  category at most, so picking another replaces it and picking the active
  one clears it; filters combine freely. Both look the same when on: bold,
  a ✓ and tinted like their pill (violet category, neutral filter), rather
  than a radio button (which can't be cleared by clicking it again) and
  checkboxes.
- Each category shows how many results picking it would give for the
  current search: the typed text of both fields, the shop, the trade
  filters, the header toggles and the other field's category
  (`SearchSortHandler.createSearchMatcher`, so the count always equals the
  result count). With Best per item it counts items.
- Both menus open on the same grid, so they look alike and a lens is one tap
  away on either side. In the UI a lens is called a *category*: the menu
  heading says "Categories" and the pills ("buying Redstone") say what it
  does. "Lens" stays the term in code and docs.
- The grid uses one-line tiles (name and result count) in two columns,
  filters included, to keep the Buying menu short. Menu rows have no icons:
  the names are short and clear, emoji look different on every platform and
  nothing like Minecraft, and the space is better spent on the name. Only
  the back arrow (‹) stays. Alt+1…4 hints are hidden on touch screens.
- On phones the menus span the whole search card instead of their field, and
  their height follows the room the on-screen keyboard leaves (the keyboard
  only shrinks the visual viewport, so `autocomplete.ts` measures it and sets
  `--menu-room`).
- **Typing** keeps the menu: up to five matching item names on top, then the
  same menu with counts for the new text, and under "Sold by" the shops and
  owners whose name matches it. Picking a category or filter keeps the text;
  picking a shop found by its name clears it. The counts replace the earlier
  keyword lookup ("piston" → Redstone): typing "piston" leaves Redstone as
  the category with results.
- Shops and trade filters narrow the whole trade, not one side, so they live
  only in the Buying menu (the main entry point). Paying offers only what is
  about payment: lenses that check the cost items.
- A click or tap outside an open menu only closes it. A backdrop catches it,
  so it doesn't also open the trade row or map underneath; on phones, where
  the menu covers most of the page, the backdrop dims the page.
- Esc on a menu opened by a click closes it and keeps the search; while
  typing, Esc clears the field as before. ↓ in a field moves into the menu,
  or into the results when there is no item name to complete. `/` and
  Ctrl+F only focus the field.

### 4. One pill row shows the state

The fixed toggle row is gone. Below the fields, one pill per active scope:

```
[buying Redstone ✕] [paying with Ores & Minerals ✕] [by ValeriaShares ✕] [Best per item ✕]
```

- Order WHAT → WHO → HOW, and colour by kind: violet lens, blue shop, neutral
  filter. The prefix word ("buying", "paying with", "by", "at") carries the
  meaning too, so colour is not the only cue.
- Clicking a pill opens the menu to change it; ✕ removes it; Backspace in an
  empty field removes that field's last pill.
- With nothing active the row is hidden.
- Alt+1…4 still toggle the four filters from anywhere.

### 5. URL and swap

The scope is part of the URL (`lens`, `paylens`, `owner`, `shop`, `filters`),
so searches stay shareable and Back/Forward restore them. Swap (⇄) also swaps
the Buying and Paying lenses.

When a lens hides every match, the empty result says so and offers a way out:
"4 matching trades outside Redstone · Show all".

## Alternatives considered

- **A button per theme in the quick bar.** It doesn't scale past a few themes and
  mixes WHAT with HOW.
- **A Filters ▾ dropdown next to the fields.** A separate picker per dimension
  adds controls. The fields are already where users go, and the owner
  suggestion showed that picking scopes from the field works.
- **User-defined lenses or "add all to cart".** Left out on purpose. Lenses only
  filter; buying stays a per-trade decision.
- **Matching on display names.** It fails for renamed items and shulker contents.
  Item IDs are stable.

## Consequences

- `quick-bar.ts` and `shop-chip.ts` are replaced by `scope-pills.ts`,
  `field-menu.ts` and the extended `autocomplete.ts`.
- Mouse users need two clicks for a filter (open the menu, tick); keyboard users
  keep the one-key Alt shortcuts.
- New filters are added to `TRADE_FILTERS` and appear in the menus without
  layout changes. New lenses are added to `LENSES` and `LENS_RULES`.
