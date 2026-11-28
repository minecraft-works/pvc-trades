# Minecraft Shop Trade Viewer

A web application for viewing and analyzing Minecraft shop trades with exchange rate matrix, deviation tracking, and live map integration for navigation.

## Features

- **Trade Search**: Filter trades by what you want to buy or sell
- **Exchange Rate Matrix**: View currency conversion rates across all tradeable items
- **Market Deviation**: See how each trade compares to other shops selling the same item, in the same currency when possible
- **Shopping Cart**: Build a shopping list and see aggregated costs
- **Route Optimization**: Compute optimal visiting order using nearest-neighbor + 2-opt
- **Live Navigation**: Track your position on the server map and navigate to shops
- **Price Intelligence**: Automatic clustering of nearby shops and of one owner's shops to prevent price manipulation
- **Fast Probing**: Item-name autocomplete, per-item prices, and searches kept in the URL (bookmarkable, Back/Forward between probes)
- **Categories, Shops and Filters**: Click the Buying field (or press `Alt+↓`) for its menu:
  - **Categories** (*lenses* in the docs) narrow a side to a theme, one tap away. There are 12: Armor, Weapons, Tools, Redstone, Flowers, Ores & Minerals, Food, Potions, Enchanted Books, Transportation, Music & Discs, Collectibles & Rarities. "Redstone" on Buying finds hoppers, pistons and observers too; a shulker box counts by its contents.
  - **Sold by** lists the three owners with the most trades; **All shops & owners** lists every owner and shop.
  - **Filters**: Deals only, Best per item, Shulkers, New.
  
  Clicking the Paying field shows the same categories ("pay with Food" finds shops that accept food). Typing also suggests matching categories, shops and filters. On phones the menu spans the search card and stays above the keyboard; a click outside an open menu only closes it. Whatever is active shows as a pill under the fields (✕ removes it) and is kept in the URL (`?lens=redstone&owner=…&filters=best`). See [ADR-023](docs/adr/023-search-lenses-and-scopes.md)
- **Shops and Owners**: The shop's name and owner appear on the map, in the route and in the cart (not in the trade table). The map also shows every other shop with stock as a dot; hover for its name, click to select it. Pick a shop or player from the Buying menu, or use "All N trades →" on the map, to see only that shop's trades; the filter is kept in the URL (`?owner=…&shop=…`), so a shop can be shared as a link
- **Flip Finder**: The **Flips** tab of the exchange-rates dialog (💱) lists items you can buy at one shop and sell to another player's shop for more, with the profit per trip; "Add both to cart" plans the route

### Keyboard Shortcuts

| Key | Where | Action |
|-----|-------|--------|
| `/` or `Ctrl+F` | Anywhere | Jump to the Buying field (a second `Ctrl+F` opens the browser's find) |
| Click or `Alt+↓` | Search field | Open the field's menu (Buying: categories, shops & owners, filters; Paying: categories) |
| `→` / `←` | Field menu | Open All shops & owners / go back |
| `Backspace` | Empty search field | Remove the field's last pill |
| `Tab` | Buying field | Go straight to the Paying field (accepts a highlighted suggestion first) |
| `Esc` | Search field | Clear the field |
| `↓` / `↑` | Search field | Move through suggestions, or into the results when there are none |
| `Enter` | Suggestion list | Accept the highlighted suggestion |
| `↓` / `↑` | Result row | Next / previous trade (`↑` on the top row returns to search) |
| `Enter` | Result row | Open the shop on the map |
| `+` | Result row | Add the trade to the cart |
| `Esc` | Result row | Back to the Buying field |
| `Alt+1` / `Alt+2` / `Alt+3` / `Alt+4` | Anywhere | Toggle "Deals only" (≤ −75%) / "Best per item" / "Shulkers" (only trades with a filled shulker box) / "New" (new since your last visit) |
| `Ctrl+Shift+X` | Anywhere | Swap the Buying and Paying terms and lenses |

Put a name in double quotes (`"emerald"`) for an exact match: it matches Emerald but not Emerald block.

## Tech Stack

- **TypeScript 6** with strict mode, checked over all code (app, tests, scripts, Workers)
- **Vite 8** for development and builds
- **lit-html** for escaped-by-default DOM templates
- **zod/mini** for runtime schema validation
- **Leaflet** for maps, loaded on demand
- **Vitest** for unit tests, **Playwright-BDD** for browser tests
- **ESLint 10** (typescript-eslint, SonarJS, Unicorn), stylelint, knip, dependency-cruiser
- **Cloudflare Workers** that add CORS to the map server's shop and player data

## Getting Started

### Prerequisites

- Node.js 22.12+ (24 recommended)
- npm 10+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev          # Dev server at http://localhost:5173/pvc-trades/
npm run fetch-data   # Download live shop data to public/data.json (used on localhost)
npm test             # Unit tests
npm run test:e2e     # BDD and Playwright spec tests (PORT=5199 for a separate dev server)
npm run check        # Full gate: typecheck, linters, knip, dependency rules, coverage
```

## Project Structure

```text
├── src/               # App: main.ts wires feature folders (search, rendering, map, navigation, …)
├── styles.css         # Entry stylesheet importing styles/*.css
├── features/          # Gherkin scenarios and step definitions
├── tests/             # Playwright specs and shared test helpers
├── workers/           # Cloudflare Workers: shops and players (CORS proxies)
├── scripts/           # fetch-data and CI checks
├── docs/              # Architecture, glossary, ADRs
├── index.html
├── config.json        # Application configuration
├── core_currencies.json   # Core blocks for ratio matrix
├── block_conversions.json # Block ↔ ingot conversion rates
└── AGENTS.md          # Conventions and workflow (for AI agents and humans)
```

## Configuration

### `config.json`

```json
{
  "squaremap": {
    "baseUrl": "https://your-map-server.com/maps",
    "playerRefreshMs": 1000
  },
  "analysis": {
    "shopClusterDistance": 16,
    "minIndependentShops": 3
  }
}
```

### `core_currencies.json`

List of core blocks used for exchange rate calculations:

```json
["Emerald Block", "Diamond Block", "Gold Block", "Iron Block", "Netherite Block"]
```

### `block_conversions.json`

Fixed conversion ratios between blocks and ingots:

```json
{
  "Diamond Block": { "Diamond": 9 },
  "Gold Block": { "Gold Ingot": 9 }
}
```

## Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run BDD tests
npm run test:e2e
```

Coverage thresholds are enforced in `vitest.config.js`.

## Documentation

- [AGENTS.md](AGENTS.md): conventions, commands and workflow
- [Architecture Overview](docs/architecture.md)
- [Domain Glossary](docs/glossary.md)

### Architecture Decision Records

- [ADR-001: Price Aggregation Design](docs/adr/001-price-aggregation-design.md)
- [ADR-002: BDD Test Framework](docs/adr/002-bdd-test-framework.md)
- [ADR-003: Disable Animations in Tests](docs/adr/003-disable-animations-in-tests.md)
- [ADR-004: Route Optimization Algorithm](docs/adr/004-route-optimization-algorithm.md)
- [ADR-005: Class-Based Stores](docs/adr/005-class-based-stores.md)
- [ADR-006: Zod Runtime Validation](docs/adr/006-zod-runtime-validation.md)
- [ADR-007: Virtual Scrolling](docs/adr/007-virtual-scrolling.md)
- [ADR-008: Nether Coordinate System](docs/adr/008-nether-coordinate-system.md)
- [ADR-009: Map Tiles Loaded Directly From the Map Server](docs/adr/009-tile-caching-strategy.md)
- [ADR-010: Limiting Requests to the External Map Server](docs/adr/010-tile-loading-minimization.md)
- [ADR-011: Player Position Interpolation](docs/adr/011-player-position-interpolation.md)
- [ADR-018: Trade Deviation Model](docs/adr/018-trade-deviation-model.md)
- [ADR-019: One Exchange-Rate Model](docs/adr/019-exchange-rate-model.md)
- [ADR-021: Lean Runtime Dependencies](docs/adr/021-lean-runtime-dependencies.md)
- [ADR-022: Fast Feedback Loop for AI Agents](docs/adr/022-agent-feedback-loop.md)
- [ADR-023: Lenses, Shops and Filters in the Search Field Menus](docs/adr/023-search-lenses-and-scopes.md)

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Map tiles blank | Map server unreachable, or it now rejects tile requests (it returns 403 for tiles requested with a foreign `Referer`) | Check the Network tab for tile requests; see [ADR-009](docs/adr/009-tile-caching-strategy.md) |
| Player not found | Name mismatch with the server's player list | Check exact spelling, case-sensitive |
| Cart not saving | localStorage blocked | Check browser privacy settings |
| Search returns nothing | Regex syntax error | Escape special chars or use wildcards |

## Contributing

1. Create a feature branch from `develop`
2. Follow [Conventional Commits](https://conventionalcommits.org)
3. Ensure `npm run check` passes (the pre-push hook runs it), plus `npm run test:e2e` for UI changes
4. Open a PR with description

See [AGENTS.md](AGENTS.md) for conventions.

## License

MIT
