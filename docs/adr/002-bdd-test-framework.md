# ADR-002: BDD Test Framework with Playwright-BDD

## Status
**Implemented** - January 2025

## Context

We need a BDD (Behavior-Driven Development) testing framework for the pvc-trades application that:

1. Allows writing human-readable Gherkin feature files
2. Integrates with Playwright for browser automation
3. Works reliably in all environments (local, CI, headed, headless)
4. Runs fast without manual setup steps
5. Supports parallel execution and sharding

### The Problem with Cucumber + Playwright as Library

The initial implementation used `@cucumber/cucumber` with Playwright used as a library. This approach has several architectural issues:

1. **Two Test Runners**: Cucumber and Playwright each have their own test runners with different lifecycles, configuration, and behaviors.

2. **Manual Server Management**: Cucumber doesn't have Playwright's `webServer` configuration. This leads to:
   - Manual server startup/shutdown in hooks
   - OS-specific spawn issues (Windows vs Unix)
   - Race conditions between server and tests
   - Complex polling/timeout logic

3. **Manual Browser Lifecycle**: Without Playwright's test runner:
   - Must manually launch/close browsers in hooks
   - Must manage contexts and pages per scenario
   - Miss auto-cleanup on failure

4. **Lost Playwright Features**:
   - No automatic screenshots/videos/traces on failure
   - No parallelization with sharding
   - No built-in retries
   - No HTML reporter with BDD context
   - No `webServer` auto-start

5. **Fixture Limitations**: Cucumber's World pattern is less flexible than Playwright's fixtures system.

## Decision

**Migrate to [playwright-bdd](https://github.com/vitalets/playwright-bdd)** - a library that converts Gherkin features into Playwright test files and runs them with Playwright's native test runner.

### How playwright-bdd Works

```
┌─────────────────┐     bddgen      ┌──────────────────┐
│  .feature files │ ─────────────► │  .spec.ts files  │
│  (Gherkin)      │                 │  (Generated)     │
└─────────────────┘                 └──────────────────┘
                                            │
         ┌──────────────────────────────────┘
         │
         ▼
┌─────────────────┐                 ┌──────────────────┐
│  Step           │ ◄──────────────│  Playwright      │
│  Definitions    │                 │  Test Runner     │
└─────────────────┘                 └──────────────────┘
                                            │
                                            ▼
                                    ┌──────────────────┐
                                    │  HTML Report     │
                                    │  (with BDD info) │
                                    └──────────────────┘
```

### Key Differences

| Aspect | Cucumber + Playwright Library | playwright-bdd |
|--------|------------------------------|----------------|
| Test Runner | Cucumber | Playwright |
| Server Management | Manual hooks | `webServer` config |
| Browser Lifecycle | Manual hooks | Automatic |
| Fixtures | World pattern | Playwright fixtures |
| Parallelization | Limited | Native sharding |
| Screenshots | Manual | Automatic |
| Traces | Manual | Automatic |
| HTML Report | Separate Cucumber reporter | Native Playwright + Cucumber reporter |
| CI Integration | Custom scripts | Native |

## Implementation

### 1. Project Structure

```
pvc-trades/
├── features/
│   ├── *.feature              # Gherkin feature files
│   └── steps/
│       ├── fixtures.ts        # Playwright fixtures + BDD setup
│       └── *.steps.ts         # Step definitions
├── .features-gen/             # Generated test files (gitignored)
└── playwright.config.ts       # Single config for everything
```

### 2. Configuration

All configuration lives in `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

const testDir = defineBddConfig({
  featuresRoot: './features',
});

export default defineConfig({
  testDir,
  
  // Automatic server management
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/pvc-trades/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  
  use: {
    baseURL: 'http://localhost:5173/pvc-trades/',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  
  // Reports
  reporter: [
    ['html', { open: 'never' }],
    cucumberReporter('html', { outputFile: 'reports/cucumber.html' }),
  ],
  
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

### 3. Step Definitions (Playwright-style)

```typescript
// features/steps/fixtures.ts
import { test as base, createBdd } from 'playwright-bdd';

export const test = base.extend<{
  // Custom fixtures here
}>();

export const { Given, When, Then } = createBdd(test);
```

```typescript
// features/steps/search.steps.ts
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

Given('the app is loaded', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.trade-row');
});

When('I search for {string} in the want field', async ({ page }, term: string) => {
  await page.locator('#searchWant').fill(term);
});

Then('only trades offering {word} should be displayed', async ({ page }, item: string) => {
  const rows = page.locator('.trade-row');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const text = await rows.nth(i).textContent();
    expect(text?.toLowerCase()).toContain(item.toLowerCase());
  }
});
```

### 4. Running Tests

```bash
# Generate tests and run
npx bddgen && npx playwright test

# Or use npm script
npm run test:bdd

# Run specific feature
npx bddgen && npx playwright test --grep "Search and Filter"

# Run with tags
npx bddgen --tags "@search" && npx playwright test

# Headed mode for debugging
npx bddgen && npx playwright test --headed

# UI mode
npx bddgen && npx playwright test --ui
```

### 5. CI Integration

```yaml
# .github/workflows/test.yml
- name: Run BDD Tests
  run: npx bddgen && npx playwright test
```

No special setup required - `webServer` handles everything.

## Consequences

### Positive

1. **Single Test Runner**: Only Playwright's runner, which is mature and well-maintained
2. **Zero Server Management**: `webServer` config handles start/stop automatically
3. **Automatic Cleanup**: Browser, context, page managed by Playwright
4. **Rich Features**: Screenshots, traces, videos, retries, parallelization out of the box
5. **Native CI Support**: Works in GitHub Actions without special configuration
6. **Fast**: Playwright's parallel execution and auto-waiting
7. **Better DX**: UI mode, VS Code extension, step-through debugging
8. **Unified Config**: One `playwright.config.ts` for everything

### Negative

1. **Build Step**: Must run `bddgen` before tests (mitigated by npm scripts)
2. **Generated Files**: `.features-gen/` directory needs gitignore
3. **Migration Effort**: Existing step definitions need minor refactoring
4. **Learning Curve**: Team needs to learn Playwright fixtures pattern

### Neutral

1. **Step Definition Style**: Can use Cucumber-style or Playwright-style (we choose Playwright-style for fixture access)

## Migration Plan

1. Install `playwright-bdd` and remove `@cucumber/cucumber` direct dependency
2. Create `features/steps/fixtures.ts` with BDD setup
3. Refactor step definitions to import from fixtures
4. Update `playwright.config.ts` with `defineBddConfig` and `webServer`
5. Remove `features/support/hooks.ts` and `features/support/world.ts`
6. Update npm scripts
7. Add `.features-gen/` to `.gitignore`
8. Update CI workflow

## References

- [playwright-bdd Documentation](https://vitalets.github.io/playwright-bdd/)
- [playwright-bdd Example Repository](https://github.com/vitalets/playwright-bdd-example)
- [Playwright Test Runner vs Library](https://playwright.dev/docs/library#key-differences)
- [Playwright webServer Config](https://playwright.dev/docs/test-webserver)
