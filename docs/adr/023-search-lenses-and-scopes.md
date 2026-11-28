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
| **WHAT** — lens | What kind of item? | 13 built-in lenses | one per side (Buying, Paying) |
| **WHAT** — biome | Where does it come from? | 29 biomes (section 6) | one per side, on top of the lens |
| **WHO** — shop | Who sells it? | an owner, or one of their shops (the admin shops are one owner, ADR-024) | one |
| **HOW** — trade filters | Which trades are good? | Deals, Best per item, Shulkers, New | any |

All three intersect. "Redstone + ValeriaShares + Best per item" is the
cheapest offer for each redstone item in ValeriaShares' shops.

### 2. Lenses are built-in, ID-based and may overlap

`src/search/lenses.ts` defines 13 lenses, in menu order: Map Art, Flowers,
Food, Redstone, Gear, Enchanting, Potions, Admin Currency, Community
Currency, Claim Blocks, Ores & Minerals, Music & Discs, Collectibles &
Rarities.

- **A lens earns its place by collecting a set that typing can't.** Text
  search already finds one item or one word (`oak`, `wool`, `stone`); a lens
  gathers items that share a purpose but not a name: every flower, disc or
  redstone component, every certificate. Generic or broad themes (building
  blocks, decoration, nature, storage, transportation, brewing ingredients,
  mob drops) were left out on purpose (2026-11-28 review): they either match
  thousands of unrelated trades or are one word away in the search field.
- The set fits this server: a peaceful, long-running SMP with a
  player-driven economy, where map art is a trade of its own. Armor, weapons
  and tools are one **Gear** lens (PvP is limited to arenas, so weapons alone
  are a niche). **Ores & Minerals** leaves out diamonds, emeralds and their
  blocks: they are the everyday money, so on the Paying side the lens would
  match nearly every trade. **Claim Blocks** are the ores that claim land
  when placed (coal, lapis, redstone, diamond and nether gold ore), plus any
  ore sold under a "… Protection Block" or "… Claim Block" name (the admin
  Claim Master sells the Chunk Protection Block as copper ore), so they are
  not in Ores & Minerals.
- A lens matches on the vanilla item ID (exact IDs plus prefixes/suffixes such
  as `_pickaxe`), never on the display name, so renamed items still count.
- Exception one: **Map Art** also takes bundles the seller named
  (`namedBundles` in its rule). The data never lists a bundle's contents, but
  on the 2026-11-28 data 130 of 131 named bundles are map art sets (89
  titles, mostly from map art shops); the one doubtful bundle is "Garden in a
  bag". Large map art is sold this way: a filled map costs a median of
  1 diamond, a named bundle 7. Unnamed bundles (mostly empty bundles sold as
  items) and blank maps (a supply) stay out. Map Art covers about 520 trades:
  389 filled maps, 131 named bundles and shulker boxes of filled maps.
- Exception two: currencies and named claim blocks (`NAMED_ITEMS`) are
  vanilla items with a fixed name. They match on item type plus name, and
  sit in their own lens only: a Vote Certificate is not in Ores, Lux not in
  Collectibles, a BB Coin not in Gear. In a shulker box the content key of a
  named item is its name, so a box of Bank-O'-Notes counts too. Diamonds and
  emeralds are neither kind of currency.
  - **Admin Currency** is issued by the server: earned by playing, voting or
    events (Playtime, Inactivity and Vote Certificates, Event and Trick or
    Treat Coins, Writer's Quill, Influencer's Apple) or from the admin shops
    and the bank (Bank-O'-Notes, Super/Hyper/Uber-Emeralds, Big Fat Diamond,
    Nepero, Caddozzo, Lux, Sponsor Tokens, Voucher Credits). The list follows
    the PVC wiki's Server Currency page and what the admin shops ("Server
    Admins", ADR-024) sell and accept.
  - **Community Currency** is issued by players and unions: BB Coin
    (BareBones Farms), $LlamaCoin, GCU Coin (Games & Competitions Union),
    Investigation Coin and Red Eye Coin. Players can mint a coin any time,
    so this list needs upkeep; an unknown coin stays in the lens of its
    vanilla type until it is added.
- An item can be in several lenses (elytra: Gear and Collectibles; tipped
  arrows: Gear and Potions). Overlap is fine because a lens is a view, not a
  category tree.
- A filled shulker box counts by its contents (any item inside matches).
- Lenses don't try to cover everything: on the 2026-11-28 data about half the
  trades are in no lens, and they stay reachable by typing.
- Lens IDs are part of shared URLs. When lenses merge, the old IDs resolve to
  the new lens (`armor`, `weapons`, `tools` → `gear`; `books` →
  `enchanting`); a dropped lens (`transport`) is ignored.
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
  one clears it; filters combine freely. Picked rows all look the same:
  bold, a ✓ and a neutral grey tint (categories, filters and Admin shops
  alike; colour is left to the pills), rather than a radio button (which
  can't be cleared by clicking it again) and checkboxes.
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
  filters included, to keep the Buying menu short. Each section (Categories,
  Biomes, Sold by, Filters) is its own group in the list, so on wider
  screens the menu hangs from the search box, spans both fields and puts
  the sections side by side: Categories | Biomes above Sold by | Filters
  from 600 px, and Categories | Biomes (three columns) | Sold by over
  Filters from 1024 px, so the whole menu shows without scrolling. Menu rows have no icons:
  the names are short and clear, emoji look different on every platform and
  nothing like Minecraft, and the space is better spent on the name. Only
  the back arrow (‹) stays. Alt+1…4 hints are hidden on touch screens.
- On phones the menus span the whole search card instead of their field, and
  their height follows the room the on-screen keyboard leaves (the keyboard
  only shrinks the visual viewport, so `autocomplete.ts` measures it and sets
  `--menu-room`), without a fixed cap, so they only scroll when the screen is
  too short. The first touch in an open menu (a tap or a scroll) makes
  the field let go of focus: the keyboard hides and the menu grows to its
  full height, while it stays open until a tap outside it, a pick that
  closes it, or the other field. Tapping the field brings the keyboard back.
  Typing stays one tap; browsing doesn't fight the keyboard.
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

The scope is part of the URL (`lens`, `paylens`, `biome`, `paybiome`,
`owner`, `shop`, `filters`), so searches stay shareable and Back/Forward
restore them. Swap (⇄) also swaps the Buying and Paying lenses and biomes.

When a lens or biome hides every match, the empty result says so and offers
a way out: "4 matching trades outside Redstone · Show all" (it clears the
lenses and biomes).

### 6. Biomes: a second WHAT, by origin

Players gather and trade by place: a jungle trip, a pale garden, an ocean
monument. A biome collects what you get there, which typing can't (the
Jungle is logs, cocoa, bamboo, melons and vines), so it passes the bar of
section 2. A broad "nature" lens was left out; per-biome sets are narrow.

- `src/search/biomes.ts` defines 29 biomes, in menu order overworld,
  caves, nether, end: Plains, Forest, Birch Forest, Dark Forest, Taiga,
  Cherry Grove, Pale Garden, Jungle, Bamboo Jungle, Savanna, Desert,
  Badlands, Swamp, Mangrove Swamp, Mushroom Fields, Snowy & Ice, Mountains,
  Beach & River, Ocean, Warm Ocean, Lush Caves, Dripstone Caves, Deep Dark,
  Nether Wastes, Crimson Forest, Warped Forest, Soul Sand Valley, Basalt
  Deltas and The End.
- A biome gets its own entry when the live data has trades for it that a
  broader one would bury. Warm Ocean (coral, tropical fish and their
  buckets, about 110 trades on 2026-11-28) sits inside Ocean, which keeps
  them too; Mountains (goat horns, emerald ore, calcite, powder snow) was
  split from the snowy biomes.
- **Only what you collect there**: blocks and plants that generate in the
  biome and drops (and buckets) of its typical mobs. Loot of a structure
  that only generates in that biome counts too: the desert pyramid's dune
  trim and sherds, the jungle temple's wild trim, the woodland mansion's
  vex trim (Dark Forest), shipwrecks, ocean monuments and ocean ruins,
  ancient cities (Deep Dark) and end cities. Structures found in many
  biomes (trial chambers, trail ruins, strongholds, outposts, nether
  bastions and fortresses) count for none. Things crafted from them don't
  count: planks, stripped logs, mud bricks, resin bricks, dyed or glazed
  terracotta. Generic mob drops found everywhere (beef, wool) are left out.
- Like lenses, biomes match on the vanilla item ID, may overlap (vines:
  Jungle and Swamp) and count a filled shulker box by its contents. A named
  currency is in no biome: LlamaCoin is not an Ocean item.
- **A separate dimension, not more lenses.** A field has one lens and one
  biome, and they intersect: Food + Ocean is fish, Gear + The End is elytra.
  Folding biomes into the lens list would have made that impossible and
  doubled the category grid.
- In the menu, a *Biomes ›* tile ends the category grid of both fields. Its
  submenu lists the biomes by region, each with its result count (like the
  categories). Typing three or more letters of a biome name offers it after
  the categories; picking it clears the text, like a shop found by name.
- The pill says "buying from Jungle" or "paying from Ocean" and reopens the
  Biomes submenu. Backspace removes a field's biome before its lens.
- The biome catalogue (IDs and names) is in the initial bundle, so
  URLs, pills and the menu work at once. The item lists
  (`src/search/biome-rules.ts`, ~1.6 kB gzip) load on demand (ADR-021):
  when the browser is idle after the first data load, when a field menu
  opens, or when the scope has a biome. Until then no item is in a biome;
  once they load, the search and the open menus run again.

## Alternatives considered

- **A button per theme in the quick bar.** It doesn't scale past a few themes and
  mixes WHAT with HOW.
- **A Filters ▾ dropdown next to the fields.** A separate picker per dimension
  adds controls. The fields are already where users go, and the owner
  suggestion showed that picking scopes from the field works.
- **User-defined lenses or "add all to cart".** Left out on purpose. Lenses only
  filter; buying stays a per-trade decision.
- **Matching on display names.** It fails for renamed items and shulker contents.
  Item IDs are stable. The server currencies are the exception, because their
  name is what makes them currency.

## Consequences

- `quick-bar.ts` and `shop-chip.ts` are replaced by `scope-pills.ts`,
  `field-menu.ts` and the extended `autocomplete.ts`.
- Mouse users need two clicks for a filter (open the menu, tick); keyboard users
  keep the one-key Alt shortcuts.
- New filters are added to `TRADE_FILTERS` and appear in the menus without
  layout changes. New lenses are added to `LENSES` and `LENS_RULES`.
