import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

// Configure BDD test generation
const bddTestDir = defineBddConfig({
    featuresRoot: './features',
    steps: './features/steps/*.ts',
});

export default defineConfig({
    // Use generated BDD tests directory
    testDir: bddTestDir,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    
    reporter: [
        ['list'],
        ['html', { open: 'never' }],
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

    projects: [
        {
            name: 'chromium',
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
