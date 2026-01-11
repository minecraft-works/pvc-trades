import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import type { Page } from 'playwright';
import sharp from 'sharp';
import {
    getTilePath,
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
    maxZoom: 8,     // at maxZoom, 1 pixel = 1 block
    minZoom: 1,     // minimum zoom level to generate
    // Rate limiting to avoid DDoS
    delayBetweenTiles: 500, // ms between tile fetches
    batchSize: 10, // tiles per batch
    delayBetweenBatches: 2000, // ms between batches
    // AVIF options
    convertToAvif: false,  // Set to true to also generate AVIF tiles
    avifQuality: 60
} as const;

interface FetchTileResult extends FetchResult {
    error?: string;
}

/**
 * Fetch a single tile by navigating to it (like fetch-data.ts does)
 * Saves in pyramid structure: {world}/{z}/{x}/{y}.png
 */
async function fetchTile(page: Page, tile: TileInfo, outputDir: string): Promise<FetchTileResult> {
    const tilePath = getTilePath(CONFIG.maxZoom, tile.tileX, tile.tileZ);
    const normalizedWorld = getNormalizedWorld(tile.world);
    
    const filepath = join(outputDir, normalizedWorld, tilePath);
    
    // Skip if already exists (from previous run)
    if (existsSync(filepath)) {
        console.log(`  [CACHED] ${normalizedWorld}/${tilePath}`);
        return { success: true, cached: true };
    }
    
    // Create directory structure
    mkdirSync(dirname(filepath), { recursive: true });
    
    // Log the exact URL being fetched
    console.log(`  [FETCH] ${tile.url}`);
    
    try {
        // Navigate to the tile URL (same approach as fetch-data.ts)
        const response = await page.goto(tile.url, { 
            waitUntil: 'load', 
            timeout: 30000 
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

/**
 * Generate lower zoom level tiles by combining 4 tiles from the higher zoom level.
 * Each tile at zoom Z-1 combines 4 tiles from zoom Z in a 2x2 grid.
 */
async function generateTilePyramid(worldDir: string, worldName: string): Promise<void> {
    console.log(`\n--- Generating tile pyramid for ${worldName} ---`);
    
    // Start from maxZoom-1 and work down to minZoom
    for (let zoom = CONFIG.maxZoom - 1; zoom >= CONFIG.minZoom; zoom--) {
        const sourceZoom = zoom + 1;
        const sourceDir = join(worldDir, String(sourceZoom));
        const targetDir = join(worldDir, String(zoom));
        
        if (!existsSync(sourceDir)) {
            console.log(`  Zoom ${sourceZoom}: No source directory, skipping`);
            continue;
        }
        
        mkdirSync(targetDir, { recursive: true });
        
        // Get all tile X directories at source zoom
        const xDirs = readdirSync(sourceDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => Number.parseInt(d.name, 10))
            .filter(x => !Number.isNaN(x));
        
        if (xDirs.length === 0) {
            console.log(`  Zoom ${sourceZoom}: No tiles found`);
            continue;
        }
        
        // Calculate which tiles we need at this zoom level
        // Each tile at zoom Z covers 2x2 tiles from zoom Z+1
        const targetTiles = new Set<string>();
        
        for (const sourceX of xDirs) {
            const xDir = join(sourceDir, String(sourceX));
            const tiles = readdirSync(xDir)
                .filter(f => f.endsWith('.png'))
                .map(f => Number.parseInt(f.replace('.png', ''), 10))
                .filter(z => !Number.isNaN(z));
            
            for (const sourceZ of tiles) {
                const targetX = Math.floor(sourceX / 2);
                const targetZ = Math.floor(sourceZ / 2);
                targetTiles.add(`${targetX}/${targetZ}`);
            }
        }
        
        console.log(`  Zoom ${zoom}: Generating ${targetTiles.size} tiles from ${xDirs.length} source columns`);
        
        let generated = 0;
        let skipped = 0;
        
        for (const key of targetTiles) {
            const [targetX, targetZ] = key.split('/').map(Number);
            const targetPath = join(targetDir, String(targetX), `${targetZ}.png`);
            
            // Skip if already exists
            if (existsSync(targetPath)) {
                skipped++;
                continue;
            }
            
            mkdirSync(dirname(targetPath), { recursive: true });
            
            // Source tiles: (2x, 2z), (2x+1, 2z), (2x, 2z+1), (2x+1, 2z+1)
            const sourceTiles: { x: number; z: number; path: string }[] = [];
            for (let dx = 0; dx <= 1; dx++) {
                for (let dz = 0; dz <= 1; dz++) {
                    const sx = targetX * 2 + dx;
                    const sz = targetZ * 2 + dz;
                    sourceTiles.push({
                        x: dx,
                        z: dz,
                        path: join(sourceDir, String(sx), `${sz}.png`)
                    });
                }
            }
            
            // Create composite image
            const composites: sharp.OverlayOptions[] = [];
            const halfSize = CONFIG.tileSize / 2;
            
            for (const tile of sourceTiles) {
                if (existsSync(tile.path)) {
                    // Resize source tile to half size and position in grid
                    const resized = await sharp(tile.path)
                        .resize(halfSize, halfSize, { kernel: 'lanczos3' })
                        .toBuffer();
                    
                    composites.push({
                        input: resized,
                        left: tile.x * halfSize,
                        top: tile.z * halfSize
                    });
                }
            }
            
            if (composites.length > 0) {
                // Create base image and composite tiles
                await sharp({
                    create: {
                        width: CONFIG.tileSize,
                        height: CONFIG.tileSize,
                        channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    }
                })
                    .composite(composites)
                    .png()
                    .toFile(targetPath);
                
                generated++;
            }
        }
        
        console.log(`    Generated: ${generated}, Skipped: ${skipped}`);
    }
}

/**
 * Convert PNG tiles to AVIF format (optional)
 */
async function convertToAvif(worldDir: string, worldName: string): Promise<void> {
    console.log(`\n--- Converting ${worldName} tiles to AVIF ---`);
    
    for (let zoom = CONFIG.minZoom; zoom <= CONFIG.maxZoom; zoom++) {
        const zoomDir = join(worldDir, String(zoom));
        if (!existsSync(zoomDir)) continue;
        
        const xDirs = readdirSync(zoomDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
        
        let converted = 0;
        
        for (const xDir of xDirs) {
            const xPath = join(zoomDir, xDir);
            const pngFiles = readdirSync(xPath).filter(f => f.endsWith('.png'));
            
            for (const pngFile of pngFiles) {
                const pngPath = join(xPath, pngFile);
                const avifPath = pngPath.replace('.png', '.avif');
                
                if (!existsSync(avifPath)) {
                    await sharp(pngPath)
                        .avif({ quality: CONFIG.avifQuality })
                        .toFile(avifPath);
                    converted++;
                }
            }
        }
        
        if (converted > 0) {
            console.log(`  Zoom ${zoom}: Converted ${converted} tiles`);
        }
    }
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
    
    // Calculate unique tiles needed (at max zoom)
    const tiles = getUniqueTiles(shopData.data, CONFIG.maxZoom, CONFIG.maxZoom, CONFIG.tileSize, CONFIG.baseUrl);
    console.log(`\nUnique tiles needed: ${tiles.length}`);
    
    // Group by world for summary
    const byWorld: Record<string, number> = {};
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
    const testUrl = `${CONFIG.baseUrl}/tiles/minecraft_overworld/${CONFIG.maxZoom}/0_0.png`;
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

    console.log('\n=== Fetch Summary ===');
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Cached: ${cached}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${tiles.length}`);
    
    // Generate tile pyramid (lower zoom levels)
    console.log('\n=== Generating Tile Pyramid ===');
    const worlds = [...new Set(tiles.map(t => getNormalizedWorld(t.world)))];
    
    for (const world of worlds) {
        const worldDir = join(outputDir, world);
        await generateTilePyramid(worldDir, world);
    }
    
    // Optionally convert to AVIF
    if (CONFIG.convertToAvif) {
        console.log('\n=== Converting to AVIF ===');
        for (const world of worlds) {
            const worldDir = join(outputDir, world);
            await convertToAvif(worldDir, world);
        }
    }
    
    console.log('\n=== Complete ===');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});