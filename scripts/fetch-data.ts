import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import type { Page } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { AppConfigSchema } from '../src/types';

// Add stealth plugin to avoid Cloudflare detection
chromium.use(StealthPlugin());

const parsedConfig = AppConfigSchema.safeParse(JSON.parse(readFileSync('config.json', 'utf8')));
if (!parsedConfig.success) {
    throw new Error('Invalid config.json');
}
const HOMEPAGE_URL = `${new URL(parsedConfig.data.squaremap.baseUrl).origin}/`;
const DATA_URL = `${HOMEPAGE_URL}shops/data.json`;

const MAX_ATTEMPTS = 30;

/**
 * Read the JSON document shown in the page and write it to public/data.json.
 *
 * @param page - Page showing the data.json response
 */
async function extractAndSaveData(page: Page): Promise<void> {
    const jsonText = await page.evaluate(() => {
        const pre = document.querySelector('pre');
        if (pre) { return pre.textContent; }
        return document.body.textContent;
    });
    console.log(`Extracted text length: ${jsonText.length} chars`);

    // Validate JSON before saving
    const data: unknown = JSON.parse(jsonText);

    mkdirSync('public', { recursive: true });
    writeFileSync('public/data.json', JSON.stringify(data));
    console.log('Successfully saved to public/data.json');
}

/**
 * Describe what the page currently shows, to help diagnose Cloudflare challenges.
 *
 * @param content - Page HTML
 * @param title - Page title
 * @returns Short status line
 */
function describePageState(content: string, title: string): string {
    if (content.includes('Just a moment') || content.includes('cf-browser-verification') || content.includes('challenge-running')) {
        return 'Cloudflare challenge in progress...';
    }
    if (title.includes('403') || content.includes('403')) {
        return '403 Forbidden page';
    }
    return 'Unknown page state';
}

async function fetchData(): Promise<void> {
    console.log('=== Starting data fetch ===');
    console.log(`Target URL: ${DATA_URL}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);

    const browser = await chromium.launch({ headless: true });
    console.log('Browser launched');

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    console.log('Browser context created');

    const page = await context.newPage();

    // Log all network responses
    page.on('response', response => {
        console.log(`[Network] ${response.status()} ${response.url().slice(0, 100)}`);
    });

    // Log console messages from the page
    page.on('console', message => {
        console.log(`[Page Console] ${message.type()}: ${message.text()}`);
    });

    try {
        // First visit homepage to get cookies
        // Use 'domcontentloaded' instead of 'networkidle' - the page has many external resources
        // (Facebook, Google Analytics, fonts) that keep making requests and cause networkidle to timeout
        console.log('\n--- Step 1: Visiting homepage to get cookies ---');
        const homeResponse = await page.goto(HOMEPAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        console.log(`Homepage response status: ${homeResponse?.status()}`);

        const cookies = await context.cookies();
        console.log(`Cookies received: ${cookies.length}`);
        for (const cookie of cookies) {
            console.log(`  - ${cookie.name}: ${cookie.value.slice(0, 30)}...`);
        }

        // Wait a bit for any JS to execute
        console.log('Waiting 3s for JS execution...');
        await page.waitForTimeout(3000);

        // Now navigate to data.json
        console.log('\n--- Step 2: Navigating to data.json ---');
        const dataResponse = await page.goto(DATA_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        console.log(`Data.json response status: ${dataResponse?.status()}`);
        console.log('Data.json response headers:');
        for (const [name, value] of Object.entries(dataResponse?.headers() ?? {})) {
            console.log(`  ${name}: ${value}`);
        }

        // Wait for Cloudflare challenge to complete (look for JSON content)
        console.log('\n--- Step 3: Waiting for content ---');
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const content = await page.content();
            const title = await page.title();

            console.log(`\nAttempt ${attempt}/${MAX_ATTEMPTS}:`);
            console.log(`  URL: ${page.url()}`);
            console.log(`  Title: "${title}"`);
            console.log(`  Content length: ${content.length} chars`);
            console.log(`  Content preview: ${content.slice(0, 200).replaceAll('\n', ' ')}`);

            // Check if we got the JSON (contains "information" and "data")
            if (content.includes('"information"') && content.includes('"data"')) {
                console.log('\n=== SUCCESS: JSON content detected ===');
                await extractAndSaveData(page);
                await browser.close();
                return;
            }

            console.log(`  Status: ${describePageState(content, title)}`);
            await page.waitForTimeout(2000);
        }

        // Final state dump
        console.log('\n=== FAILED: Timeout reached ===');
        const finalContent = await page.content();
        console.log('Final page content:');
        console.log(finalContent.slice(0, 2000));

        throw new Error('Timeout waiting for Cloudflare challenge to complete');
    } catch (error) {
        console.error('\n=== ERROR ===');
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Stack:', error.stack);
        } else {
            console.error(error);
        }
        await browser.close();
        process.exit(1);
    }
}

void fetchData();
