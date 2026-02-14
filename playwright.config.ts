import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

// Configure BDD test generation
const bddTestDir = defineBddConfig({
    featuresRoot: './features',
    steps: './features/steps/*.ts',
    // Skip scenarios tagged with @skip
    tags: 'not @skip',
});

export default defineConfig({
    // BDD tests have their own testDir, regular tests use 'tests' dir
    testDir: bddTestDir,
    testMatch: '**/*.spec.js',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    
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
        baseURL: 'http://localhost:5173/pvc-trades/',
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
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Start dev server before running tests
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173/pvc-trades/',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
});
