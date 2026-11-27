# Minecraft Shop Trade Viewer

A web application for viewing and analyzing Minecraft shop trades with exchange rate matrix, deviation tracking, and live map integration for navigation.

## Features

- **Trade Search**: Filter trades by what you want to buy or sell
- **Exchange Rate Matrix**: View currency conversion rates across all tradeable items
- **Market Deviation**: See how each trade compares to other shops selling the same item, in the same currency when possible
- **Shopping Cart**: Build a shopping list and see aggregated costs
- **Route Optimization**: Compute optimal visiting order using nearest-neighbor + 2-opt
- **Live Navigation**: Track your position on the server map and navigate to shops
- **Price Intelligence**: Automatic clustering of nearby shops to prevent price manipulation
- **Fast Probing**: Item-name autocomplete, one-click currency chips, "Deals only" and "Best per item" filters, per-item prices, and searches kept in the URL (bookmarkable, Back/Forward between probes)

### Keyboard Shortcuts

| Key | Where | Action |
|-----|-------|--------|
| `/` or `Ctrl+F` | Anywhere | Jump to the Buying field (a second `Ctrl+F` opens the browser's find) |
| `Tab` | Buying field | Go straight to the Paying field (accepts a highlighted suggestion first) |
| `Esc` | Search field | Clear the field |
| `↓` / `↑` | Search field | Move through suggestions, or into the results when there are none |
| `Enter` | Suggestion list | Accept the highlighted suggestion |
| `↓` / `↑` | Result row | Next / previous trade (`↑` on the top row returns to search) |
| `Enter` | Result row | Open the shop on the map |
| `+` | Result row | Add the trade to the cart |
| `Esc` | Result row | Back to the Buying field |
| `Alt+1` / `Alt+2` | Anywhere | Toggle "Deals only" (≤ −20%) / "Best per item" |
| `Ctrl+Shift+X` | Anywhere | Swap the Buying and Paying terms |

Put a name in double quotes (`"emerald"`) for an exact match: it matches Emerald but not Emerald block.

## Tech Stack

- **TypeScript 6** with strict mode
- **Vite 8** for development and builds
- **Zod 4** for runtime schema validation
- **Vitest** for unit testing with v8 coverage
- **Playwright-BDD** for behavioral testing with Gherkin
- **ESLint 10** with SonarJS and Unicorn plugins
- **Leaflet** for interactive maps

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
# Start dev server
npm run dev

# Run unit tests
npm test

# Run BDD and Playwright spec tests (headless)
npm run test:e2e

# Run BDD tests in a headed browser
npm run test:e2e:headed

# Run all checks (lint + typecheck + test)
npm run lint:all && npm run typecheck && npm test

# Type checking only
npm run typecheck

# Lint
npm run lint
```

## Project Structure

```text
├── src/
│   ├── main.ts        # Application entry point (UI, events, rendering)
│   ├── library.ts     # Pure functions (filtering, sorting, routing)
│   ├── library.test.ts# Unit tests
│   ├── types.ts       # TypeScript interfaces & Zod schemas
│   └── debug.ts       # Debug logging utilities
├── features/
│   ├── *.feature      # Gherkin BDD scenarios
│   └── steps/         # Step definitions
├── docs/
│   ├── architecture.md    # System overview
│   ├── code-patterns.md   # Coding patterns reference
│   ├── glossary.md        # Domain terminology
│   ├── testing-guide.md   # How to write tests
│   └── adr/               # Architecture Decision Records
├── public/
│   └── data.json      # Trade data (local development)
├── workers/
│   └── players/       # Cloudflare Worker proxying live player positions
├── index.html         # Main HTML file
├── styles.css         # Styles with CSS custom properties
├── config.json        # Application configuration
├── core_currencies.json   # Core blocks for ratio matrix
└── block_conversions.json # Block ↔ ingot conversion rates
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

- [Architecture Overview](docs/architecture.md)
- [Code Patterns](docs/code-patterns.md)
- [Domain Glossary](docs/glossary.md)
- [Testing Guide](docs/testing-guide.md)

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
- [ADR-018: Trade Deviation Model](docs/adr/018-trade-deviation-model.md)

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
3. Ensure `npm run lint:all`, `npm run typecheck` and `npm test` pass
4. Open a PR with description

See [code patterns](docs/code-patterns.md) and [testing guide](docs/testing-guide.md) for conventions.

## License

MIT
