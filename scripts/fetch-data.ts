import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { writeFileSync, mkdirSync } from 'fs';

// Add stealth plugin to avoid Cloudflare detection
chromium.use(StealthPlugin());

const DATA_URL = 'https://web.peacefulvanilla.club/shops/data.json';
const HOMEPAGE_URL = 'https://web.peacefulvanilla.club/';

async function fetchData() {
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
        console.log(`[Network] ${response.status()} ${response.url().substring(0, 100)}`);
    });
    
    // Log console messages from the page
    page.on('console', msg => {
        console.log(`[Page Console] ${msg.type()}: ${msg.text()}`);
    });

    try {
        // First visit homepage to get cookies
        // Use 'domcontentloaded' instead of 'networkidle' - the page has many external resources
        // (Facebook, Google Analytics, fonts) that keep making requests and cause networkidle to timeout
        console.log('\n--- Step 1: Visiting homepage to get cookies ---');
        const homeResponse = await page.goto(HOMEPAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`Homepage response status: ${homeResponse?.status()}`);
        
        const cookies = await context.cookies();
        console.log(`Cookies received: ${cookies.length}`);
        cookies.forEach(c => console.log(`  - ${c.name}: ${c.value.substring(0, 30)}...`));
        
        // Wait a bit for any JS to execute
        console.log('Waiting 3s for JS execution...');
        await page.waitForTimeout(3000);
        
        // Now navigate to data.json
        console.log('\n--- Step 2: Navigating to data.json ---');
        const dataResponse = await page.goto(DATA_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`Data.json response status: ${dataResponse?.status()}`);
        console.log('Data.json response headers:');
        const headers = dataResponse?.headers() || {};
        Object.entries(headers).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
        
        // Wait for Cloudflare challenge to complete (look for JSON content)
        let attempts = 0;
        const maxAttempts = 30;
        
        console.log('\n--- Step 3: Waiting for content ---');
        while (attempts < maxAttempts) {
            const content = await page.content();
            const contentLength = content.length;
            const title = await page.title();
            const url = page.url();
            
            console.log(`\nAttempt ${attempts + 1}/${maxAttempts}:`);
            console.log(`  URL: ${url}`);
            console.log(`  Title: "${title}"`);
            console.log(`  Content length: ${contentLength} chars`);
            console.log(`  Content preview: ${content.substring(0, 200).replace(/\n/g, ' ')}`);
            
            // Check if we got the JSON (starts with { and contains "information")
            if (content.includes('"information"') && content.includes('"data"')) {
                console.log('\n=== SUCCESS: JSON content detected ===');
                
                // Extract JSON from the page body
                const jsonText = await page.evaluate(() => {
                    const pre = document.querySelector('pre');
                    if (pre) {return pre.textContent;}
                    return document.body.textContent;
                });
                
                console.log(`Extracted text length: ${jsonText?.length || 0} chars`);
                
                // Validate JSON
                const data = JSON.parse(jsonText);
                console.log(`Parsed JSON - shops count: ${data.data?.length || 'unknown'}`);
                
                mkdirSync('public', { recursive: true });
                writeFileSync('public/data.json', JSON.stringify(data));
                console.log('Successfully saved to public/data.json');
                await browser.close();
                return;
            }
            
            // Check if still on Cloudflare challenge page
            if (content.includes('Just a moment') || content.includes('cf-browser-verification') || content.includes('challenge-running')) {
                console.log('  Status: Cloudflare challenge in progress...');
            } else if (title.includes('403') || content.includes('403')) {
                console.log('  Status: 403 Forbidden page');
            } else {
                console.log('  Status: Unknown page state');
            }
            
            await page.waitForTimeout(2000);
            attempts++;
        }
        
        // Final state dump
        console.log('\n=== FAILED: Timeout reached ===');
        const finalContent = await page.content();
        console.log('Final page content:');
        console.log(finalContent.substring(0, 2000));
        
        throw new Error('Timeout waiting for Cloudflare challenge to complete');
    } catch (error) {
        console.error('\n=== ERROR ===');
        console.error('Error message:', error.message);
        console.error('Stack:', error.stack);
        await browser.close();
        process.exit(1);
    }
}

fetchData();
