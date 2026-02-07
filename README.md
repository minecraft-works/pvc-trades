# Minecraft Shop Trade Viewer

A web application for viewing and analyzing Minecraft shop trades with exchange rate matrix, deviation tracking, and Dynmap integration for live navigation.

## Features

- **Trade Search**: Filter trades by what you want to buy or sell
- **Exchange Rate Matrix**: View currency conversion rates across all tradeable items
- **Market Deviation**: See how each trade compares to the median market price
- **Shopping Cart**: Build a shopping list and see aggregated costs
- **Route Optimization**: Compute optimal visiting order using nearest-neighbor + 2-opt
- **Live Navigation**: Track your position via Dynmap and navigate to shops
- **Price Intelligence**: Automatic clustering of nearby shops to prevent price manipulation

## Tech Stack

- **TypeScript 5.9** with strict mode
- **Vite 7** for development and builds
- **Zod 4** for runtime schema validation
- **Vitest** for unit testing with v8 coverage
- **Playwright-BDD** for behavioral testing with Gherkin
- **ESLint 9** with SonarJS and Unicorn plugins
- **Leaflet** for interactive maps

## Getting Started

### Prerequisites

- Node.js 20+
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

# Run BDD tests (headed browser)
npm run test:e2e

# Run all checks (lint + typecheck + test)
npm run check

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
│   ├── data.json      # Trade data
│   └── tiles/         # Map tile images
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
  "dynmap": {
    "baseUrl": "https://your-dynmap-server.com",
    "tileSize": 128,
    "defaultZoom": 5,
    "maxZoomLevel": 6,
    "playerRefreshMs": 5000
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

# Run BDD tests headless (CI)
npm run test:ci
```

Coverage thresholds are set to 80% for all metrics (lines, functions, branches, statements).

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Code Patterns](docs/code-patterns.md)
- [Domain Glossary](docs/glossary.md)
- [Testing Guide](docs/testing-guide.md)
- [Test Scenarios](SCENARIOS.md)
- [Quality Analysis](docs/quality-analysis.md)

### Architecture Decision Records

- [ADR-001: Price Aggregation Design](docs/adr/001-price-aggregation-design.md)
- [ADR-002: BDD Test Framework](docs/adr/002-bdd-test-framework.md)
- [ADR-003: Disable Animations in Tests](docs/adr/003-disable-animations-in-tests.md)
- [ADR-004: Route Optimization Algorithm](docs/adr/004-route-optimization-algorithm.md)
- [ADR-005: Class-Based Stores](docs/adr/005-class-based-stores.md)
- [ADR-006: Zod Runtime Validation](docs/adr/006-zod-runtime-validation.md)
- [ADR-007: Virtual Scrolling](docs/adr/007-virtual-scrolling.md)
- [ADR-008: Nether Coordinate System](docs/adr/008-nether-coordinate-system.md)
- [ADR-009: Tile Caching Strategy](docs/adr/009-tile-caching-strategy.md)

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Map tiles blank | Tiles not fetched or CORS blocked | Run `npm run fetch-tiles` |
| Player not found | Name mismatch with Dynmap | Check exact spelling, case-sensitive |
| Cart not saving | localStorage blocked | Check browser privacy settings |
| Search returns nothing | Regex syntax error | Escape special chars or use wildcards |

## Contributing

1. Create a feature branch from `develop`
2. Follow [Conventional Commits](https://conventionalcommits.org)
3. Ensure `npm run check` passes
4. Open a PR with description

See [code patterns](docs/code-patterns.md) and [testing guide](docs/testing-guide.md) for conventions.

## License

MIT
