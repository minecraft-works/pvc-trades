# System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   index.html │  │  styles.css │  │   main.ts (bundled)     │  │
│  │   (Entry)    │  │  (Styles)   │  │   + library.ts          │  │
│  │              │  │             │  │   + types.ts            │  │
│  └─────────────┘  └─────────────┘  │   + debug.ts            │  │
│                                     │   + virtual-scroller    │  │
│                                     │   + leaflet             │  │
│                                     └─────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    localStorage                              │  │
│  │  • pvc-trades-cart (CartItem[])                             │  │
│  │  • pvc-trades-nav-progress (NavigationProgress)             │  │
│  │  • pvc-trades-player (string)                               │  │
│  │  • pvc-trades-nav-tab (string)                              │  │
│  │  • pvc-trades-nav-mode (NavigationMode)                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Static Assets                             │
├─────────────────────────────────────────────────────────────────┤
│  /data.json          - Shop and trade data                       │
│  /config.json        - Application configuration                 │
│  /players.json       - Live player positions (Dynmap proxy)      │
│  /core_currencies.json - Core block definitions                  │
│  /block_conversions.json - Block↔ingot conversion rates          │
│  /tiles/{world}/{z}/{x}/{y}.png - Map tile images                │
│  /tiles/manifest.json - Available tiles manifest                 │
│  /icons/*.png        - Minecraft item icons                      │
└─────────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### `src/main.ts` (3200 lines)
**Role**: Application entry point, DOM orchestration, UI state

| Section | Lines | Responsibility |
|---------|-------|----------------|
| Dialog Utilities | 79-127 | Backdrop close, openDialog helper |
| State | 128-207 | Global state variables |
| Shopping Cart | 209-302 | Cart CRUD, localStorage sync |
| Navigation Progress | 303-537 | Route progress tracking |
| DOM Helpers | 538-551 | getElement, type-safe access |
| Data Loading | 552-609 | Fetch and process shop data |
| Search & Sort | 610-778 | Search logic, multi-column sort |
| Deviation Calc | 779-946 | Price deviation analysis |
| Rendering | 779-946 | Trade row rendering, virtual scroll |
| Matrix Dialog | 947-1033 | Exchange rate matrix UI |
| Map Dialog | 1034-1612 | Leaflet map, tile loading, markers |
| Cart Dialog | 1613-1816 | Cart items, timeline, shopping list |
| Tab Switching | 1817-1878 | Cart dialog tab management |
| Live Navigation | 1879-2520 | Player tracking, auto-advance |
| Shop Tooltip | 2521-2737 | Proximity-based shop info |
| Navigation Map | 2738-3106 | Navigation-specific map view |
| Initialization | 3107-3191 | DOMContentLoaded setup |

### `src/library.ts` (1277 lines)
**Role**: Pure functions, no DOM dependencies

| Category | Functions |
|----------|-----------|
| Search | `matchesQuery`, `getRegex`, `filterTrade`, `sortResults` |
| Values | `calculateItemValues`, `getTrustedItemValue`, `getRatio` |
| Ratios | `buildRatioGraph`, `loadFixedRatios`, `loadBaseItems` |
| Route | `computeOptimalOrder`, `twoOptOptimize`, `calculateRouteDistance` |
| Coordinates | `getTileCoords`, `toLeafletCoords`, `clampToCircle` |
| Utilities | `median`, `formatName`, `highlight`, `escapeHtml` |

### `src/types.ts` (301 lines)
**Role**: TypeScript types and Zod schemas

| Category | Items |
|----------|-------|
| Core Types | `Trade`, `Item`, `Shop`, `ShopData` |
| Cart Types | `CartItem`, `RouteStop`, `ShoppingList` |
| Navigation | `NavigationProgress`, `NavigationMode`, `Player` |
| Config | `AppConfig`, `DynmapConfig` |
| Schemas | `AppConfigSchema`, `BlockConversionsSchema`, etc. |

### `src/debug.ts` (28 lines)
**Role**: Debug logging utilities

```typescript
export const debugNavigation = debug('pvc:navigation');
export const debugWorldSwitch = debug('pvc:world-switch');
export const debugPlayerPoll = debug('pvc:player-poll');
export const debugMap = debug('pvc:map');
export const debugTiles = debug('pvc:tiles');
```

## Data Flow

### Search Flow
```
User Input → debouncedSearch() → filterTrade() → sortResults() → renderResults()
     │              │                  │               │              │
     │              │                  │               │              └─ Virtual Scroller
     │              │                  │               └─ Multi-column sort
     │              │                  └─ library.ts (pure)
     │              └─ 150ms debounce
     └─ #searchWant / #searchGive inputs
```

### Cart Flow
```
Add to Cart → addToCart() → saveCart() → localStorage
                  │             │
                  │             └─ updateCartBadge()
                  └─ Update cart[] array

View Cart → openDialog('cart-dialog') → renderCartDialog()
                                              │
                                              ├─ createCartItemElement() × N
                                              ├─ getShoppingList() → costs/gains
                                              └─ renderNavigateTab() → route timeline
```

### Navigation Flow
```
Start Navigation → startNavigation() → fetchPlayers() → initNavigationMapDialog()
                         │                    │                    │
                         │                    │                    ├─ computeRoute()
                         │                    │                    ├─ Create Leaflet map
                         │                    │                    └─ Add shop markers
                         │                    └─ Get initial position
                         └─ Close cart, open nav dialog

Poll Loop → pollPlayerPosition() → updatePlayerMarker() → checkAutoAdvance()
      │              │                     │                     │
      │              │                     │                     └─ Auto-complete nearby shops
      │              │                     └─ Rotate marker, draw route line
      │              └─ Fetch player position
      └─ setInterval (configurable ms)
```

## State Management

### Global State (main.ts)
```typescript
// Trade data (loaded once)
let allTrades: Trade[] = [];
let mappingRules: MappingRule[] = [];
let itemValues: ItemValues | undefined;
let ratioGraph: RatioGraph | undefined;

// Search state
let cachedRegex: RegExp | undefined;
let searchDebounceTimer: number | undefined;
let virtualScroller: VirtualScroller<FilterResult> | undefined;

// Sort state
const activeSorts: Map<SortColumn, SortDirection> = new Map([['dev', 'asc']]);

// Cart state
let cart: CartItem[] = [];

// Navigation state
let navProgress: NavigationProgress;
let isNavigating = false;
let navMode: NavigationMode = 'follow';
let currentPlayerPosition: { x, z, world, yaw } | undefined;
```

### Persisted State (localStorage)
| Key | Type | Purpose |
|-----|------|---------|
| `pvc-trades-cart` | `CartItem[]` | Shopping cart contents |
| `pvc-trades-nav-progress` | `{ completedKeys, currentIndex }` | Route completion |
| `pvc-trades-player` | `string` | Saved player name |
| `pvc-trades-nav-tab` | `string` | Active cart dialog tab |
| `pvc-trades-nav-mode` | `'follow' \| 'manual'` | Map centering mode |

## External Dependencies

### Runtime Dependencies
| Package | Purpose | Bundle Impact |
|---------|---------|---------------|
| `leaflet` | Interactive maps | ~40KB |
| `virtual-scroller` | Virtualized lists | ~15KB |
| `zod` | Runtime validation | ~12KB |
| `debug` | Debug logging | ~2KB (stripped in prod) |

### Dev Dependencies
| Package | Purpose |
|---------|---------|
| `vite` | Build tool, dev server |
| `vitest` | Unit testing |
| `playwright` | Browser automation |
| `playwright-bdd` | Gherkin test runner |
| `typescript` | Type checking |
| `eslint` | Linting |

## Build Configuration

### Vite Config
```typescript
// vite.config.ts
export default defineConfig({
    build: {
        target: 'esnext',
        sourcemap: true
    },
    server: {
        proxy: {
            '/players.json': 'http://dynmap.example.com'
        }
    }
});
```

### TypeScript Config
- Target: ES2022
- Module: ESNext
- Strict mode enabled
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Test Pyramid                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│                    ┌───────────────┐                             │
│                    │  E2E (BDD)    │  features/*.feature          │
│                    │  78 scenarios │  Playwright + playwright-bdd │
│                    └───────────────┘                             │
│                                                                   │
│            ┌─────────────────────────────┐                       │
│            │      Unit Tests             │  src/*.test.ts         │
│            │      244 tests              │  Vitest                │
│            └─────────────────────────────┘                       │
│                                                                   │
│    ┌─────────────────────────────────────────────┐               │
│    │            Static Analysis                   │               │
│    │  TypeScript + ESLint + SonarJS + Unicorn    │               │
│    └─────────────────────────────────────────────┘               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```
