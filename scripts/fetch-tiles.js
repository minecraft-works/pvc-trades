import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Add stealth plugin to avoid Cloudflare detection
chromium.use(StealthPlugin());

const CONFIG = {
    baseUrl: 'https://web.peacefulvanilla.club/maps',
    homepageUrl: 'https://web.peacefulvanilla.club/',
    tileSize: 128,
    zoom: 4,
    maxZoom: 7,
    // Rate limiting to avoid DDoS
    delayBetweenTiles: 500, // ms between tile fetches
    batchSize: 10, // tiles per batch
    delayBetweenBatches: 2000 // ms between batches
};

/**
 * Calculate tile coordinates from Minecraft world coordinates
 * Dynmap uses a specific coordinate system where tiles are indexed by their position
 */
function getTileCoords(x, z, zoom, maxZoom, tileSize) {
    // Scale factor based on zoom level difference
    const scale = Math.pow(2, maxZoom - zoom);
    // Blocks covered per tile at this zoom
    const blocksPerTile = tileSize * scale;
    
    // Calculate tile indices (can be negative)
    const tileX = Math.floor(x / blocksPerTile);
    const tileZ = Math.floor(z / blocksPerTile);
    
    return { tileX, tileZ, blocksPerTile };
}

/**
 * Get tile filename from coordinates
 */
function getTileFilename(tileX, tileZ) {
    return `${tileX}_${tileZ}.png`;
}

/**
 * Get tile URL for a world
 */
function getTileUrl(world, zoom, tileX, tileZ) {
    const worldLower = world.toLowerCase();
    const worldId = worldLower === 'world' || worldLower === 'overworld' ? 'minecraft_overworld' 
        : worldLower === 'world_nether' || worldLower.includes('nether') ? 'minecraft_the_nether'
        : worldLower === 'world_the_end' || worldLower.includes('end') ? 'minecraft_the_end'
        : `minecraft_${world}`;
    return `${CONFIG.baseUrl}/tiles/${worldId}/${zoom}/${tileX}_${tileZ}.png`;
}

/**
 * Parse shop location string to coordinates
 */
function parseLocation(location) {
    const coords = location.split(', ');
    return {
        x: parseFloat(coords[0]) || 0,
        y: parseFloat(coords[1]) || 0,
        z: parseFloat(coords[2]) || 0
    };
}

/**
 * Get unique tiles needed for all shops (including 3x3 neighbors)
 */
function getUniqueTiles(shops) {
    const tilesMap = new Map();
    
    for (const shop of shops) {
        const { x, z } = parseLocation(shop.location);
        const world = shop.world.replace('minecraft:', '');
        const { tileX, tileZ, blocksPerTile } = getTileCoords(
            x, z, CONFIG.zoom, CONFIG.maxZoom, CONFIG.tileSize
        );
        
        // Add the center tile and all 8 neighbors (3x3 grid)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const tx = tileX + dx;
                const tz = tileZ + dz;
                const key = `${world}/${tx}_${tz}`;
                
                if (!tilesMap.has(key)) {
                    tilesMap.set(key, {
                        world,
                        tileX: tx,
                        tileZ: tz,
                        blocksPerTile,
                        url: getTileUrl(world, CONFIG.zoom, tx, tz),
                        shops: []
                    });
                }
                
                // Only track shops on the center tile
                if (dx === 0 && dz === 0) {
                    tilesMap.get(key).shops.push({ x, z, location: shop.location });
                }
            }
        }
    }
    
    return Array.from(tilesMap.values());
}

/**
 * Get normalized world name for output directory
 */
function getNormalizedWorld(world) {
    const worldLower = world.toLowerCase();
    return worldLower === 'world' || worldLower === 'overworld' ? 'overworld'
        : worldLower === 'world_nether' || worldLower.includes('nether') ? 'the_nether'
        : worldLower === 'world_the_end' || worldLower.includes('end') ? 'the_end'
        : world;
}

/**
 * Fetch a single tile by navigating to it (like fetch-data.js does)
 */
async function fetchTile(page, tile, outputDir) {
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
        // Navigate to the tile URL (same approach as fetch-data.js)
        const response = await page.goto(tile.url, { 
            waitUntil: 'load', 
            timeout: 30000 
        });
        
        if (!response) {
            console.log(`  [FAIL] ${normalizedWorld}/${filename}: No response`);
            return { success: false, error: 'No response' };
        }
        
        const status = response.status();
        if (status !== 200) {
            console.log(`  [FAIL] ${normalizedWorld}/${filename}: HTTP ${status}`);
            return { success: false, error: `HTTP ${status}` };
        }
        
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('image')) {
            console.log(`  [FAIL] ${normalizedWorld}/${filename}: Not an image (${contentType})`);
            return { success: false, error: `Not an image: ${contentType}` };
        }
        
        // Get the raw body as buffer
        const buffer = await response.body();
        writeFileSync(filepath, buffer);
        console.log(`  [OK] ${normalizedWorld}/${filename} (${buffer.length} bytes)`);
        return { success: true, cached: false };
    } catch (error) {
        console.log(`  [ERROR] ${normalizedWorld}/${filename}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Sleep utility
 */
function sleep(ms) {
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
    const tiles = getUniqueTiles(shopData.data);
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
    
    console.log(`\nFetching ${tiles.length} tiles...`);
    console.log(`Rate limit: ${CONFIG.delayBetweenTiles}ms between tiles, ${CONFIG.delayBetweenBatches}ms between batches of ${CONFIG.batchSize}`);
    
    for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const result = await fetchTile(page, tile, outputDir);
        
        if (result.success) {
            if (result.cached) cached++;
            else downloaded++;
        } else {
            failed++;
        }
        
        // Rate limiting
        if ((i + 1) % CONFIG.batchSize === 0 && i < tiles.length - 1) {
            console.log(`\n  Batch complete. Waiting ${CONFIG.delayBetweenBatches}ms...`);
            await sleep(CONFIG.delayBetweenBatches);
        } else if (i < tiles.length - 1) {
            await sleep(CONFIG.delayBetweenTiles);
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
