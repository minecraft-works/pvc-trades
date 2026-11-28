# Domain Glossary

This glossary defines domain-specific terms used throughout the Shop Trades codebase.

## Minecraft Concepts

### Overworld
The main dimension in Minecraft. Coordinates are displayed in **green** in the UI. All standard coordinates without dimension qualification refer to the Overworld.

### Nether (The Nether)
A hell-like dimension accessible through portals. Has an **8:1 coordinate ratio** with the Overworld:
- Moving 1 block in the Nether = moving 8 blocks in the Overworld
- `netherCoords * 8 = overworldEquivalent`
- Displayed in **red** in the UI

### The End
A separate dimension with no coordinate relationship to other dimensions. Displayed with `E` world indicator.

### Portal
A gateway structure that allows travel between dimensions. In routing, portals are special stops inserted when the route crosses dimensions.

## Trading Concepts

### Trade
A shop offer where players give certain items to receive other items. Structure:
```typescript
interface Trade {
    resultName: string;      // What you receive
    resultAmount: number;    // How many you receive
    item1: Item;            // Primary cost
    item2?: Item;           // Optional secondary cost
    x, y, z: number;        // Shop location
    world: string;          // Dimension
}
```

### Cost / Give
The items a player must provide to complete a trade. Can be one or two different item types.

### Result / Want
The items a player receives from completing a trade.

### Stock
The number of times a trade can be completed. `0` means out of stock (displayed with special styling).

### Shop
A shopkeeper at specific coordinates that offers trades. The shop data gives most shops a **name** (the shopkeeper's name tag, e.g. "End Item Vendor") and an **owner** (the player). Both are kept out of the trade table and shown where a player looks for the shop: the map dialog, route stops, the cart, the navigation tooltip, and the distance cell's tooltip.

### Shop Filter
Limits the results to one owner's shops, or to one named shop of that owner. Set by picking a shop or owner in the Buying field's menu (typed, or from **Shops & owners**), or with "All N trades →" on the map. Shown as a removable pill under the search and kept in the URL (`?owner=…&shop=…`).

### Admin Shop
One of the server's own shops (the spawn villagers), added by the shops Worker. Owner `Server Admins` (`ADMIN_SHOP_OWNER`), fixed prices and unlimited stock. The `stock` value is a placeholder, shown as ∞ and never used for ranking. Pick **Admin shops** in the Buying menu to see only them (`?owner=Server+Admins`). Together they count as one independent shop ([ADR-024](adr/024-admin-shops.md)).

### Independent Shop
A shop that is more than **16 blocks** away from other shops **and** has a different owner. Shops of one owner count as one source wherever they are, which prevents price manipulation through proximity or through one player's chain of shops (see [ADR-001](adr/001-price-aggregation-design.md)).

### Flip
A profitable round trip between two shops of different owners: buy an item at one shop and sell it to the other for more of the same currency. Listed in the **Flips** tab of the exchange-rates dialog with the profit per trip (trade uses limited by stock, leftovers counted as lost); "Add both to cart" hands it to the route planner.

## Economic Concepts

### Deviation
How much a trade's effective price differs from the market median. Calculated as a percentage:
- **Negative deviation** (green): Good deal, below market price
- **Positive deviation** (red): Bad deal, above market price
- **No deviation data**: Gray, insufficient market data

### Core Blocks / Core Currencies
The base value items used for price comparison:
- Emerald Block
- Diamond Block  
- Gold Block
- Iron Block
- Netherite Ingot

### Item Value
The calculated worth of an item in emerald-equivalent units, derived through:
1. **Base units**: blocks that craft back into their base count as that base (1 Diamond block = 9 Diamond); one-way recipes such as quartz blocks stay separate
2. **Phase 1 — Direct trades**: trades where one side is a currency (emerald, or a currency valued by the currency graph)
3. **Phase 2 — Transitive derivation**: iteratively using known item values as intermediaries

Only in-stock trades count (ADR-019).

### Currency Graph
Exchange rates between currencies (ADR-019): the core currencies plus any item used to pay for at least 5 different goods at 3 or more independent shops (coins, certificates). Buy and Sell come from the direct market between two currencies when it is trusted; otherwise they are composed through other currencies (buy along buy rates, sell along sell rates). Sell is never above Buy: a crossed market shows the mid rate.

Used by `buildCurrencyGraph()` for the 💱 Rates tab and converter, and to value currencies in emeralds for Deal % estimates and flips.

### Trusted Value
A price value with high confidence, derived from independent shops with sufficient data points. For core currencies, requires ≥3 independent shops (>16 blocks apart, different owners). Values can come from direct trades, block conversions (ingot × 9), or transitive derivation through known intermediaries.

## Navigation Concepts

### Route
An optimized sequence of shop visits calculated using:
1. **Nearest Neighbor** algorithm for initial ordering
2. **2-opt optimization** to refine the path

### Route Stop
A point on the route. Types:
- `shop`: A cart item's shop location
- `portal`: A dimension crossing point (auto-inserted)

### Completed Stop
A shop that has been marked as visited/collected during navigation.

### Current Stop
The next shop the user should visit (first non-completed stop).

### Navigation Mode
How the map behaves during live navigation:
- `follow`: Map auto-centers on player position
- `manual`: User controls map position

### Auto-Advance
Automatic completion of stops when the player comes within **50 blocks** of a shop during live navigation.

### Live Navigation
Real-time tracking mode that polls player position from the live player feed and updates the route display.

## UI Concepts

### Cart
A collection of trades the user wants to complete, with quantities for each.

### Shopping List
Aggregated view of cart contents:
- **Costs**: Total items needed across all cart trades
- **Gains**: Total items received across all cart trades

### Timeline
Visual representation of the route with stops showing:
- Completion status (dot: ○ pending, ✓ completed)
- Coordinates (Overworld and Nether equivalent)
- Trade details

### Matrix Dialog
The exchange-rates dialog (💱) with two tabs. **Rates** shows key currency pairs in a table, the more valuable item first ("1 Netherite ingot = 17.4 Diamond blocks"), with both sides of the market side by side: **Buy** is what one item costs at a shop, **Sell** what a shop pays for it. A converter below works the same way for any two core currencies. **Flips** lists profitable round trips between shops. Ratios are derived from median emerald values via direct trades and transitive derivation (e.g., Netherite Ingot valued through Diamond Block → Emerald chains).

### Squaremap
The web-based live map of the Minecraft server (`squaremap.baseUrl` in `config.json`). Used for:
- Tile images, loaded directly by the browser (see [ADR-009](adr/009-tile-caching-strategy.md))
- The live player list (proxied by the players Worker, which adds CORS headers)

### Tile
A square 512×512 px map image at a specific zoom and coordinate. URL: `{baseUrl}/tiles/minecraft_{world}/{zoom}/{x}_{z}.png`. At zoom 8 one pixel is one block; each lower zoom doubles the area.

### Virtual List
Performance optimization that only renders the trade rows in and around the viewport; padding stands in for the rest (`src/rendering/virtual-list.ts`, ADR-007).

### Favorites / Watchlist
A user-curated list of items they want to track. Each favorite can have an optional **threshold** filter. When the dashboard detects trades for favorited items, they appear in the **Watchlist Deals** section.

### Lens
A built-in item category (Map Art, Redstone, Gear, …) that narrows one side of the search: on Buying it keeps trades whose received item is in the lens, on Paying trades that ask for one. Lenses match on vanilla item IDs, may overlap, and count a shulker box by its contents; **Map Art** also takes bundles the seller named, which are map art sets, and **Admin Currency** and **Community Currency** take the named currencies (certificates, Bank-O'-Notes, coins) by type and name: issued by the server or by players. A lens collects a set that typing one word can't find. The UI calls them *categories* ([ADR-023](adr/023-search-lenses-and-scopes.md)).

### Biome
Where an item comes from (Jungle, Ocean, Deep Dark, …): a second way to narrow one side of the search, next to the lens and intersecting with it (Food + Ocean is fish). A biome holds only what you collect there, its blocks, plants and mob drops, not what is crafted from them, and matches on vanilla item IDs like a lens ([ADR-023](adr/023-search-lenses-and-scopes.md)).

### Search Scope
Everything besides the typed text that narrows the results: a **lens** and a **biome** per side (what), a **shop or owner** (who, including the admin shops as a group) and **trade filters** such as Deals or Best per item (how). Picked from a search field's menu, shown as pills under the fields, and kept in the URL.

### Threshold
A per-favorite deviation filter (e.g., ≤−25%). Only trades at or below this deviation level trigger a watchlist hit in the dashboard. Items with no threshold show all matching trades.

### Dashboard / Daily Deals
A collapsible banner at the top of the page that shows changes since the user's last visit:
- **New Trades**: Trades not present in the previous snapshot
- **Price Drops**: Trades whose deviation improved by ≥5 percentage points
- **Watchlist Deals**: Favorited items with matching trades, sorted by most decreased deviation

### Snapshot
A localStorage record of all trade deviations at a point in time. Used as a baseline for dashboard comparison.

### Rolling Snapshot
A compact history of snapshots stored with key deduplication. Format: `{ keys: string[], snapshots: [{ t: number, v: [dev|null, stock][] }] }`. Snapshots are appended at intervals (minimum 1h) and pruned to keep the most useful baselines.

### Player Interpolation
Smooth marker movement between polled player positions using velocity extrapolation. Avoids jerky jumps by blending corrections over a correction phase before switching to pure extrapolation.

## Technical Concepts

### Filter Result
The output of search/filter operations:
```typescript
interface FilterResult {
    trade: Trade;
    matchResult: boolean;  // Name matches "want" search
    matchCost: boolean;    // Cost matches "give" search
    displayName?: string;  // Modified name for mapping
    displayAmount?: number;// Modified amount for bundles
}
```

### Mapping Rule
A transformation applied to trade display:
- Resolves shulker boxes to contents
- Converts bundles to component items

### Trade Key
A unique identifier for a trade: `${x}-${y}-${z}-${resultName}-${costName}`

### Leaflet Coordinates
Leaflet uses `[latitude, longitude]` (y, x) format, while Minecraft uses `(x, z)`. Conversion functions handle this mapping.

## Abbreviations

| Abbrev | Meaning |
|--------|---------|
| OW | Overworld |
| N | Nether |
| E | The End |
| Dev | Deviation (price difference) |
| Amt | Amount |
| Qty | Quantity |
| Nav | Navigation |
| TSP | Traveling Salesman Problem (route optimization) |
