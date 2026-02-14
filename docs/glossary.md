# Domain Glossary

This glossary defines domain-specific terms used throughout the PVC Trades codebase.

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
A chest or container at specific coordinates that offers trades.

### Independent Shop
A shop that is more than **16 blocks** away from any other shop. This distance threshold prevents price manipulation through proximity.

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
The calculated worth of an item in emerald-equivalent units, derived from:
1. Fixed ratios (block_conversions.json)
2. Market medians from independent shop trades

### Ratio Graph
A data structure mapping item-to-item conversion rates, built from:
- Fixed conversions (9 ingots = 1 block)
- Trade data (what shops actually exchange)

### Trusted Value
A price value with high confidence, derived from independent shops with sufficient data points.

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
Real-time tracking mode that polls player position from Dynmap and updates the route display.

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
A grid showing exchange rates between all core currency pairs.

### Dynmap
A web-based map renderer for Minecraft servers. Used for:
- Tile images (pre-rendered map chunks)
- Player position polling

### Tile
A square map image at a specific zoom level and coordinate. Format: `tiles/{world}/{zoom}/{x}/{z}.png`

### Virtual Scroller
Performance optimization that only renders visible rows in long lists, recycling DOM elements as the user scrolls.

### Favorites / Watchlist
A user-curated list of items they want to track. Each favorite can have an optional **threshold** filter. When the dashboard detects trades for favorited items, they appear in the **Watchlist Deals** section.

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
