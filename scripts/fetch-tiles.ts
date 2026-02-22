import { existsSync,mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import {
    calculateRateLimitDelay,
    type FetchResult,
    getBaseMapTiles,
    getNormalizedWorld,
    getTilePath,
    getUniqueTiles,
    type TileInfo} from './tile-utils';

// Add stealth plugin to avoid Cloudflare detection
chromium.use(StealthPlugin());

const CONFIG = {
    baseUrl: 'https://web.peacefulvanilla.club/maps',
    homepageUrl: 'https://web.peacefulvanilla.club/',
    tileSize: 512,  // pixels per tile
    maxZoom: 8,     // at maxZoom, 1 pixel = 1 block
    minZoom: 1,     // minimum zoom level to generate
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
 * Saves in pyramid structure: {world}/{z}/{x}/{y}.png
 */
async function fetchTile(page: Page, tile: TileInfo, outputDir: string): Promise<FetchTileResult> {
    // Calculate actual zoom level from blocksPerTile
    // At maxZoom (8), blocksPerTile = tileSize (512)
    // At zoom 4, blocksPerTile = 512 * 2^(8-4) = 512 * 16 = 8192
    const zoom = CONFIG.maxZoom - Math.log2(tile.blocksPerTile / CONFIG.tileSize);
    const tilePath = getTilePath(zoom, tile.tileX, tile.tileZ);
    const normalizedWorld = getNormalizedWorld(tile.world);
    
    const filepath = path.join(outputDir, normalizedWorld, tilePath);
    
    // Skip if already exists (from previous run)
    if (existsSync(filepath)) {
        console.log(`  [CACHED] ${normalizedWorld}/${tilePath}`);
        return { success: true, cached: true };
    }
    
    // Create directory structure
    mkdirSync(path.dirname(filepath), { recursive: true });
    
    // Log the exact URL being fetched
    console.log(`  [FETCH] ${tile.url}`);
    
    try {
        // Navigate to the tile URL (same approach as fetch-data.ts)
        const response = await page.goto(tile.url, { 
            waitUntil: 'load', 
            timeout: 30_000 
        });
        
        if (!response) {
            console.log(`  [FAIL] ${normalizedWorld}/${tilePath}: No response`);
            return { success: false, cached: false, error: 'No response' };
        }
        
        const status = response.status();
        if (status !== 200) {
            console.log(`  [FAIL] ${normalizedWorld}/${tilePath}: HTTP ${status}`);
            return { success: false, cached: false, error: `HTTP ${status}` };
        }
        
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('image')) {
            console.log(`  [FAIL] ${normalizedWorld}/${tilePath}: Not an image (${contentType})`);
            return { success: false, cached: false, error: `Not an image: ${contentType}` };
        }
        
        // Get the raw body as buffer
        const buffer = await response.body();
        writeFileSync(filepath, buffer);
        console.log(`  [OK] ${normalizedWorld}/${tilePath} (${buffer.length} bytes)`);
        return { success: true, cached: false };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  [ERROR] ${normalizedWorld}/${tilePath}: ${message}`);
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
    
    const shopData = JSON.parse(readFileSync(dataPath, 'utf8'));
    console.log(`Loaded ${shopData.data.length} shops`);
    
    // Get zoom 8 tiles around shops (5x5 grid per shop)
    const shopTiles = getUniqueTiles(shopData.data, CONFIG.maxZoom, CONFIG.maxZoom, CONFIG.tileSize, CONFIG.baseUrl);
    console.log(`\nShop tiles (zoom 8): ${shopTiles.length}`);
    
    // Get zoom 4 base map tiles (range -5 to 4, which is 10x10 = 100 tiles)
    const baseMapTiles = getBaseMapTiles(-5, 4, -5, 4, 4, CONFIG.maxZoom, CONFIG.tileSize, CONFIG.baseUrl, 'overworld');
    console.log(`Base map tiles (zoom 4): ${baseMapTiles.length}`);
    
    // Combine both sets, removing duplicates
    const tilesMap = new Map<string, TileInfo>();
    for (const tile of [...shopTiles, ...baseMapTiles]) {
        const key = `${tile.world}/${tile.tileX}/${tile.tileZ}/${tile.blocksPerTile}`;
        if (!tilesMap.has(key)) {
            tilesMap.set(key, tile);
        }
    }
    const tiles = [...tilesMap.values()];
    console.log(`\nTotal unique tiles: ${tiles.length}`);
    
    // Group by world and zoom for summary
    const byWorldZoom: Record<string, Record<number, number>> = {};
    for (const tile of tiles) {
        if (!byWorldZoom[tile.world]) {
            byWorldZoom[tile.world] = {};
        }
        const zoom = CONFIG.maxZoom - Math.log2(tile.blocksPerTile / CONFIG.tileSize);
        byWorldZoom[tile.world][zoom] = (byWorldZoom[tile.world][zoom] || 0) + 1;
    }
    console.log('By world/zoom:', JSON.stringify(byWorldZoom, null, 2));
    
    // Output directory
    const outputDir = 'public/tiles';
    mkdirSync(outputDir, { recursive: true });
    
    // Track successfully fetched tiles for manifest (written after fetch loop)
    const successfulTiles: TileInfo[] = [];
    
    // Launch browser
    console.log('\nLaunching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    // Visit homepage first to get cookies
    console.log('Visiting homepage for cookies...');
    await page.goto(CONFIG.homepageUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    await sleep(3000);
    
    // Sanity check: fetch a center tile (0_0) to verify dynmap is accessible
    console.log('\n--- Sanity check: fetching center tile ---');
    const testUrl = `${CONFIG.baseUrl}/tiles/minecraft_overworld/${CONFIG.maxZoom}/0_0.png`;
    console.log(`Testing: ${testUrl}`);
    
    try {
        const testResponse = await page.goto(testUrl, { waitUntil: 'load', timeout: 30_000 });
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

        // Update counters and track successful tiles
        if (result.success) {
            successfulTiles.push(tile);
            if (result.cached) {
                cached++;
            } else {
                downloaded++;
            }
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

    console.log('\n=== Fetch Summary ===');
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Cached: ${cached}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${tiles.length}`);
    
    // Save tile manifest AFTER fetching - only include successful tiles
    const manifest = successfulTiles.map(t => ({
        world: t.world,
        tileX: t.tileX,
        tileZ: t.tileZ,
        blocksPerTile: t.blocksPerTile,
        shopCount: t.shops.length
    }));
    writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`\nSaved tile manifest with ${manifest.length} entries (${failed} failed tiles excluded)`);
    
    console.log('\n=== Complete ===');
    console.log('Note: Tile pyramid generation skipped.');
    console.log('Zoom 8: High detail around shops');
    console.log('Zoom 4: Base map coverage (-5 to 4 range)');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});