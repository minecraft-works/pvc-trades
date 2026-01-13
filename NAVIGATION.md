# Navigation Feature Plan

## Overview

A live GPS-like navigation system that tracks the player's position via Dynmap API and guides them through the optimized trade route.

## Cart Structure

### Two Tabs

| Tab | Purpose | Focus |
|-----|---------|-------|
| **Plan** | Shopping list view | Review trades, edit cart, see route summary |
| **Navigate** | Live navigation | Follow player, show progress, interactive map |

---

## Plan Tab

The existing cart view, enhanced with a route timeline.

### Route Timeline (Vertical)

```
✓━━ Start (0, 0, 0)
┃   1,234 blocks
●━━ Diamond Shop (500, 64, -300)
┃   856 blocks
○━━ Emerald Shop (800, 72, 200)
┃   943 blocks
○━━ End (0, 0, 0)
```

### Timeline Symbols

| Symbol | Meaning |
|--------|---------|
| `✓` | Completed stop |
| `●` | Current stop (next destination) |
| `○` | Pending stop |

### Interactions (Plan Tab)

- **Click dot** → Toggle completion (manual check-off)
- **Click label** → No action (or show mini-map popup?)

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
│  ✓━━ Start                          │
│  ┃   1,234 blocks                   │
│  ●━━ Diamond Shop ← YOU ARE HERE    │
│  ┃   856 blocks (↓ updating live)   │
│  ○━━ Emerald Shop                   │
│  ┃   943 blocks                     │
│  ○━━ End                            │
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
- [x] Render stops with `✓`, `●`, `○` symbols
- [x] Show distance between stops
- [x] Click dot to toggle completion
- [x] Style timeline (vertical line, spacing)
- [x] Persist progress to localStorage
- [x] Sync progress when cart changes (recalc route, preserve completed)

### Phase 2: Tab Structure

- [ ] Add tab UI to cart dialog (Plan / Navigate)
- [ ] Preserve cart content when switching tabs
- [ ] Style active/inactive tabs

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
| `src/main.ts` | Tab UI, timeline component, navigation logic |
| `src/lib.ts` | Helper functions (if needed) |
| `styles.css` | Timeline styles, tab styles, navigation UI |
| `src/types.ts` | New types (NavigationState, etc.) |

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Progress persistence | ✅ Save to localStorage |
| Route recalc on cart change | ✅ Recalc, preserve progress for remaining shops |
| Implementation approach | ✅ Phased, starting with Plan tab timeline |
