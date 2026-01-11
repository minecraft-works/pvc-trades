import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Page } from 'playwright';
import {
    getTileFilename,
    getNormalizedWorld,
    getUniqueTiles,
    calculateRateLimitDelay,
    type TileInfo,
    type RateLimitState,
    type RateLimitConfig,
    type FetchResult
} from './tile-utils';

// Add stealth plugin to avoid Cloudflare detection
chromium.use(StealthPlugin());

const CONFIG = {
    baseUrl: 'https://web.peacefulvanilla.club/maps',
    homepageUrl: 'https://web.peacefulvanilla.club/',
    tileSize: 512,  // pixels per tile
    zoom: 8,        // zoom level 8: 1 pixel = 1 block
    maxZoom: 8,     // at maxZoom, 1 pixel = 1 block
    // Rate limiting to avoid DDoS
    delayBetweenTiles: 500, // ms between tile fetches
    batchSize: 10, // tiles per batch
    delayBetweenBatches: 2000 // ms between batches
} as const;

interface FetchTileResult extends FetchResult {
    error?: string;
}

/**
 * Fetch a single tile by navigating to it (like fetch-data.ts does)
 */
async function fetchTile(page: Page, tile: TileInfo, outputDir: string): Promise<FetchTileResult> {
    const filename = getTileFilename(tile.tileX, tile.tileZ);
    const normalizedWorld = getNormalizedWorld(tile.world);
    
    const worldDir = join(outputDir, normalizedWorld);
    const filepath = join(worldDir, filename);
    
    // Skip if already exists (from previous run)
    if (existsSync(filepath)) {
        console.log(`  [CACHED] ${normalizedWorld}/${filename}`);
        return { success: true, cached: true };
    }
    
    mkdirSync(worldDir, { recursive: true });
    
    // Log the exact URL being fetched
    console.log(`  [FETCH] ${tile.url}`);
    
    try {
        // Navigate to the tile URL (same approach as fetch-data.ts)
        const response = await page.goto(tile.url, { 
            waitUntil: 'load', 
            timeout: 30000 
        });
        
        if (!response) {
            console.log(`  [FAIL] ${normalizedWorld}/${filename}: No response`);
            return { success: false, cached: false, error: 'No response' };
        }
        
        const status = response.status();
        if (status !== 200) {
            console.log(`  [FAIL] ${normalizedWorld}/${filename}: HTTP ${status}`);
            return { success: false, cached: false, error: `HTTP ${status}` };
        }
        
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('image')) {
            console.log(`  [FAIL] ${normalizedWorld}/${filename}: Not an image (${contentType})`);
            return { success: false, cached: false, error: `Not an image: ${contentType}` };
        }
        
        // Get the raw body as buffer
        const buffer = await response.body();
        writeFileSync(filepath, buffer);
        console.log(`  [OK] ${normalizedWorld}/${filename} (${buffer.length} bytes)`);
        return { success: true, cached: false };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  [ERROR] ${normalizedWorld}/${filename}: ${message}`);
        return { success: false, cached: false, error: message };
    }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('=== Tile Fetcher ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    // Read shop data
    const dataPath = 'public/data.json';
    if (!existsSync(dataPath)) {
        console.error(`Error: ${dataPath} not found. Run fetch-data.js first.`);
        process.exit(1);
    }
    
    const shopData = JSON.parse(readFileSync(dataPath, 'utf-8'));
    console.log(`Loaded ${shopData.data.length} shops`);
    
    // Calculate unique tiles needed
    const tiles = getUniqueTiles(shopData.data, CONFIG.zoom, CONFIG.maxZoom, CONFIG.tileSize, CONFIG.baseUrl);
    console.log(`\nUnique tiles needed: ${tiles.length}`);
    
    // Group by world for summary
    const byWorld = {};
    for (const tile of tiles) {
        byWorld[tile.world] = (byWorld[tile.world] || 0) + 1;
    }
    console.log('By world:', byWorld);
    
    // Output directory
    const outputDir = 'public/tiles';
    mkdirSync(outputDir, { recursive: true });
    
    // Save tile manifest for frontend use
    const manifest = tiles.map(t => ({
        world: t.world,
        tileX: t.tileX,
        tileZ: t.tileZ,
        blocksPerTile: t.blocksPerTile,
        shopCount: t.shops.length
    }));
    writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`\nSaved tile manifest with ${manifest.length} entries`);
    
    // Launch browser
    console.log('\nLaunching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    // Visit homepage first to get cookies
    console.log('Visiting homepage for cookies...');
    await page.goto(CONFIG.homepageUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    
    // Sanity check: fetch a center tile (0_0) to verify dynmap is accessible
    console.log('\n--- Sanity check: fetching center tile ---');
    const testUrl = `${CONFIG.baseUrl}/tiles/minecraft_overworld/${CONFIG.zoom}/0_0.png`;
    console.log(`Testing: ${testUrl}`);
    
    try {
        const testResponse = await page.goto(testUrl, { waitUntil: 'load', timeout: 30000 });
        const testStatus = testResponse?.status();
        const testContentType = testResponse?.headers()['content-type'] || '';
        
        if (testStatus !== 200) {
            console.error(`\nSanity check FAILED: HTTP ${testStatus}`);
            console.error('The dynmap tile server may be down or blocking requests.');
            await browser.close();
            process.exit(1);
        }
        
        if (!testContentType.includes('image')) {
            console.error(`\nSanity check FAILED: Expected image, got ${testContentType}`);
            console.error('The dynmap may be returning an error page.');
            await browser.close();
            process.exit(1);
        }
        
        const testBuffer = await testResponse.body();
        console.log(`Sanity check PASSED: Got ${testBuffer.length} bytes of image data`);
    } catch (error) {
        console.error(`\nSanity check FAILED: ${error.message}`);
        console.error('Cannot connect to dynmap. Aborting tile fetch.');
        await browser.close();
        process.exit(1);
    }
    
    // Fetch tiles in batches with rate limiting
    let downloaded = 0;
    let cached = 0;
    let failed = 0;
    const rateLimitState = { fetchedInBatch: 0 };
    const rateLimitConfig = {
        batchSize: CONFIG.batchSize,
        delayBetweenTiles: CONFIG.delayBetweenTiles,
        delayBetweenBatches: CONFIG.delayBetweenBatches
    };

    console.log(`\nFetching ${tiles.length} tiles...`);
    console.log(`Rate limit: ${CONFIG.delayBetweenTiles}ms between fetches, ${CONFIG.delayBetweenBatches}ms between batches of ${CONFIG.batchSize}`);

    for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const result = await fetchTile(page, tile, outputDir);

        // Update counters
        if (result.success) {
            if (result.cached) cached++;
            else downloaded++;
        } else {
            failed++;
        }

        // Calculate rate limit delay using tested utility
        const hasMoreTiles = i < tiles.length - 1;
        const rateLimit = calculateRateLimitDelay(result, rateLimitState, rateLimitConfig, hasMoreTiles);
        
        if (rateLimit.batchComplete) {
            console.log(`\n  Batch complete. Waiting ${rateLimit.delay}ms...`);
        }
        
        if (rateLimit.delay > 0) {
            await sleep(rateLimit.delay);
        }
    }

    await browser.close();

    console.log('\n=== Summary ===');
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Cached: ${cached}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${tiles.length}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});