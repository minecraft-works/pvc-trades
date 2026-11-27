import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

// Configure BDD test generation
const bddTestDir = defineBddConfig({
    featuresRoot: './features',
    steps: './features/steps/*.ts',
    // Skip scenarios tagged with @skip
    tags: 'not @skip',
});

// Each worktree can run its own dev server: PORT=5199 npm run test:e2e
const PORT = Number(process.env.PORT ?? 5173);
const BASE_URL = `http://localhost:${String(PORT)}/pvc-trades/`;

export default defineConfig({
    // BDD tests have their own testDir, regular tests use 'tests' dir
    testDir: bddTestDir,
    testMatch: '**/*.spec.js',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    
    reporter: [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'reports/playwright-results.json' }],
        cucumberReporter('html', { 
            outputFile: 'reports/cucumber-report.html',
            externalAttachments: true,
        }),
    ],
    
    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    // Store visual regression baselines in a tracked directory (not .features-gen which is gitignored)
    snapshotPathTemplate: 'features/__snapshots__/{arg}-{projectName}-{platform}{ext}',

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'chromium-spec',
            testDir: './tests',
            testMatch: '**/*.spec.ts',
            // Timing benchmarks run on demand via `npm run test:load`
            testIgnore: '**/tile-load-testing.spec.ts',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'perf',
            testDir: './tests',
            testMatch: '**/tile-load-testing.spec.ts',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Start dev server before running tests
    webServer: {
        command: `npm run dev -- --port ${String(PORT)} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
});
