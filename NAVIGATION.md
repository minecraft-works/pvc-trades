# Navigation Feature Plan

## Overview

A live GPS-like navigation system that tracks the player's position via Dynmap API and guides them through the optimized trade route.

## Cart Structure

### Two Tabs

| Tab | Purpose | Content |
|-----|---------|--------|
| **Plan** | Route planning | Route timeline + total distance |
| **Navigate** | Live navigation | Player input, live map, timeline |

### Tab Content Layout

**Plan Tab** (route planning only):
```
┌───────────────────────────────────────┐
│  [ Plan ]  [ Navigate ]           │
├───────────────────────────────────────┤
│  🗺️ Optimized Route               │
│  ○  3× Enchanted Book  -69,64  ...  │
│  ○  1× Diamond Pick   -115,-284 ... │
│  ○  2× Mending Book   -91,-7   ...  │
│  ─────────────────────────────────── │
│  Distance:         21,905   2,738  │
└───────────────────────────────────────┘
```

**Cart section** (always visible, above tabs):
```
┌───────────────────────────────────────┐
│  🛒 Shopping Cart                   │
├───────────────────────────────────────┤
│  1× Enchanted Book ← 64× Emerald [±]×│
│  2× Diamond Pick  ← 32× Diamond [±]×│
├───────────────────────────────────────┤
│  📦 Items     │  💰 Total Cost       │
│  3× Ench Book │  64× Emerald        │
│  2× Dia Pick  │  32× Diamond        │
├───────────────────────────────────────┤
│  [ Plan ]  [ Navigate ]  ← TABS    │
└───────────────────────────────────────┘
```

### What Moves to Plan Tab

The route section currently at the bottom of the cart dialog moves entirely into the Plan tab:
- 🗺️ Optimized Route header
- Route timeline (shops with coordinates)
- Total distance display

The cart items and shopping lists (Items/Costs) remain **above** the tabs, always visible.

---

## Plan Tab

The existing cart view, enhanced with a compact route timeline.

### Route Timeline (Vertical)

Compact table-aligned layout showing shops only (no Start/End):

```
○  3× Enchanted Book      -69, 64      -9, 8
○  1× Diamond Pickaxe    -115, -284   -14, -36
○  2× Mending Book        -91, -7     -11, -1   ← Nether shop (red)
○  1× Golden Apple      -7374, -1772  -922, -222
─────────────────────────────────────────────────
Distance:                 21,905       2,738
```

### Timeline Columns

| Column | Description |
|--------|-------------|
| **Dot** | Clickable completion toggle |
| **Item** | Quantity × Item name |
| **OW Coords** | Overworld coordinates (green) |
| **Nether Coords** | Nether-equivalent coordinates (red) |

### Timeline Dot States

| State | Appearance | Meaning |
|-------|------------|---------|
| Completed | `✓` (checkmark) | Shop visited |
| Current | Empty dot (filled accent during navigation) | Next destination |
| Pending | Empty dot | Not yet visited |

### World Indication

- **Overworld shops**: Green text color (`--color-good-deal`)
- **Nether shops**: Red text color (`--color-bad-deal`)
- Both coordinate systems shown for all shops (OW and Nether equivalent)

### Distance Display

- **Per-stop distances removed** (too cluttered)
- **Total distance** shown at bottom, aligned with coordinate columns
- Shows both OW blocks and Nether-equivalent blocks

### Interactions (Plan Tab)

- **Click dot** → Toggle completion (manual check-off)
- **Click row** → Open map dialog centered on shop

---

## Navigate Tab

Full navigation experience with live map.

### Layout

```
┌─────────────────────────────────────┐
│  [Player Name Input] [Start Nav]    │
├─────────────────────────────────────┤
│                                     │
│           [ LIVE MAP ]              │
│                                     │
├─────────────────────────────────────┤
│  ✓  Diamond Shop       -69, 64     │
│  ●  Emerald Shop ← YOU ARE HERE    │
│  ○  Golden Apple     -7374, -1772  │
│─────────────────────────────────────│
│  Distance:            21,905  2,738 │
└─────────────────────────────────────┘
```

### Map Behavior

#### Follow Mode (Default)

Map automatically centers based on player-to-shop distance:

| Distance | Zoom | Center |
|----------|------|--------|
| Far (>500 blocks) | Low (zoomed out) | Player position |
| Near (<500 blocks) | High (zoomed in) | Shop position |

#### Manual Mode

- User pans/zooms manually
- "Re-center" button appears to return to Follow Mode

### Auto-Advance

When player is within **50 blocks** of current shop:
1. Mark current stop as complete (`✓`)
2. Advance to next stop (`●`)
3. Update map focus to new destination

### Interactions (Navigate Tab)

- **Click dot** → Toggle completion (same as Plan)
- **Click label** → Center map on that stop, switch to Manual Mode

---

## Data Flow

### Player Position Polling

```
Dynmap API → /up/world/{world}/
           → players[].x, y, z, world
           → Poll every {playerRefreshMs} (config.json)
```

### Distance Calculation

- Use `toOverworldEquivalent()` for Nether coordinates (÷8)
- 3D Euclidean distance for "blocks to go"
- Update live in timeline

---

## Persistence (localStorage)

### Keys

| Key | Data | Purpose |
|-----|------|---------|
| `nav-player-name` | `string` | Remember player name |
| `nav-progress` | `{ completedKeys: string[], currentIndex: number }` | Track route progress |
| `nav-mode` | `"follow" \| "manual"` | Map centering mode |

### Behavior on Cart Change

1. Recalculate optimal route
2. Keep completion status for shops still in cart
3. Reset progress for removed shops
4. If current stop was removed, advance to next valid stop

---

## Implementation Todos

### Phase 1: Plan Tab Timeline ✅

- [x] Add route timeline component to cart dialog
- [x] Render stops with checkmark/empty dot states
- [x] Show dual coordinates (OW green, Nether red) per stop
- [x] Click dot to toggle completion
- [x] Click row to open map dialog
- [x] Style timeline (compact, table-aligned columns)
- [x] Remove Start/End elements (shops only)
- [x] Remove per-stop distances (total at bottom instead)
- [x] Show total distance in both OW and Nether blocks
- [x] World indication via text color (green=OW, red=Nether)
- [x] Persist progress to localStorage
- [x] Sync progress when cart changes (recalc route, preserve completed)

### Phase 1.5: Compact Cart Layout ✅

- [x] Make cart items single-line with smaller controls
- [x] Compact shopping lists (Items/Costs)
- [x] Smaller buttons (22px qty buttons, × for remove)
- [x] Consistent compact styling throughout cart dialog

### Phase 2: Tab Structure

- [ ] Add tab bar below shopping lists (Plan / Navigate)
- [ ] Move route section into Plan tab content area
- [ ] Create empty Navigate tab placeholder
- [ ] Style tab buttons (active/inactive states)
- [ ] Persist active tab to localStorage
- [ ] Cart items + shopping lists remain above tabs (always visible)
- [ ] Default to Plan tab on open

### Phase 3: Navigate Tab - Static

- [ ] Add player name input field
- [ ] Add "Start Navigation" button
- [ ] Embed Leaflet map in Navigate tab
- [ ] Show route on map (polyline)
- [ ] Show shop markers on map

### Phase 4: Navigate Tab - Live

- [ ] Poll Dynmap API for player position
- [ ] Show player marker on map
- [ ] Calculate live distance to current stop
- [ ] Update distance display in real-time
- [ ] Implement Follow Mode (auto-center)
- [ ] Implement Manual Mode (user pans)
- [ ] Add "Re-center" button

### Phase 5: Auto-Advance

- [ ] Detect when player is <50 blocks from shop
- [ ] Auto-complete current stop
- [ ] Advance to next stop
- [ ] Update map focus

### Phase 6: Persistence ✅

- [x] Save player name to localStorage
- [x] Save progress (completed stops) to localStorage
- [x] Save map mode to localStorage
- [x] Restore state on page load
- [x] Handle cart changes (recalc route, preserve progress)

### Phase 7: Polish

- [ ] Add loading states
- [ ] Handle player not found
- [ ] Handle Dynmap API errors
- [ ] Add "End Navigation" button
- [ ] Responsive design for mobile
- [ ] Keyboard navigation

---

## Technical Notes

### Route Optimization Algorithm

The route is optimized using a two-phase approach:

1. **Nearest-Neighbor Heuristic**: Builds initial route by always picking the closest unvisited shop
2. **2-opt Optimization**: Iteratively improves by reversing segments when it reduces total distance

**Distance Calculation**:
- All distances use **overworld-equivalent coordinates**
- Nether coordinates are multiplied by 8 to get overworld-equivalent
- This means a nether shop at (-91, -7) is treated as (-728, -56) for distance purposes
- Route starts from origin (0, 0) in overworld

**Why the route may look "wrong"**:
- The algorithm minimizes **total distance**, not each individual step
- Sometimes visiting a distant shop early allows grouping nearby shops later
- Example: Visiting a far shop then doubling back may save distance vs. leaving it for last

### Existing Infrastructure

- **Dynmap API**: Already used for shop markers, player list
- **Leaflet**: Already integrated for map dialogs
- **Route Optimization**: `computeOptimalOrder()` in `lib.ts`
- **Config**: `playerRefreshMs` controls poll interval

### New Dependencies

None required - all functionality can be built with existing stack.

### File Changes

| File | Changes |
|------|---------|
| `src/main.ts` | Tab UI, timeline component, navigation logic, compact cart layout |
| `src/lib.ts` | Route optimization (nearestNeighborOrder, twoOptOptimize) |
| `styles.css` | Timeline styles, compact cart styles, grid-aligned coordinates |
| `src/types.ts` | NavigationProgress, RouteStopStatus, storage keys |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Shops only in timeline | Start/End clutter; origin is implicit |
| No portals in route | Portal routing adds complexity; users know their portal network |
| Text color for world | More subtle than icons; aligns with deal colors |
| Dual coordinates | Players use both; helpful for nether travel planning |
| No per-stop distances | Too cluttered; total is more useful |
| Grid layout for alignment | Table-like appearance without actual table element |
| Compact styling | More shops visible at once; less scrolling |
| 2-opt optimization | ~95% optimal without exponential complexity |

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Progress persistence | ✅ Save to localStorage |
| Route recalc on cart change | ✅ Recalc, preserve progress for remaining shops |
| Implementation approach | ✅ Phased, starting with Plan tab timeline |
