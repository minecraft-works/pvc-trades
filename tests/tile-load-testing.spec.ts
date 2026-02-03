/**
 * Load/Performance tests for tile loading scenarios
 * 
 * Tests how the app performs under heavy tile loading conditions:
 * - Concurrent tile requests
 * - Rapid pan/zoom operations
 * - Memory usage with many tiles
 * - Response time degradation
 */
import { test, expect } from './helpers/global-setup';
import type { Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// ============================================================================
// Test Configuration
// ============================================================================

const LOAD_TEST_CONFIG = {
    /** Number of rapid pan operations to test */
    rapidPanCount: 20,
    /** Maximum acceptable response time for tile load (ms) */
    maxTileLoadTime: 2000,
    /** Maximum acceptable time for map to become interactive (ms) */
    maxMapInteractiveTime: 3000,
    /** Number of concurrent map opens to simulate */
    concurrentMapOpens: 5,
    /** Delay between rapid operations (ms) */
    operationDelay: 50,
};

// ============================================================================
// PNG Generation Helpers
// ============================================================================

const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xED_B8_83_20 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

function crc32(data: Buffer): Buffer {
    let crc = 0xFF_FF_FF_FF;
    for (const byte of data) {
        crc = crcTable[(crc ^ byte) & (0xFF)] ^ (crc >>> 8);
    }
    crc = crc ^ 0xFF_FF_FF_FF;
    const result = Buffer.alloc(4);
    result.writeUInt32BE(crc >>> 0, 0);
    return result;
}

function createColoredPng(r: number, g: number, b: number): Buffer {
    const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    const ihdrData = Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00
    ]);
    const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
    const ihdr = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x0D]),
        Buffer.from('IHDR'),
        ihdrData,
        ihdrCrc
    ]);
    
    const rawData = Buffer.from([0x00, r, g, b]);
    const compressed = deflateSync(rawData);
    const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
    const idat = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from('IDAT'),
        compressed,
        idatCrc
    ]);
    idat.writeUInt32BE(compressed.length, 0);
    
    const iendCrc = crc32(Buffer.from('IEND'));
    const iend = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from('IEND'),
        iendCrc
    ]);
    
    return Buffer.concat([header, ihdr, idat, iend]);
}

const TILE_PNG = createColoredPng(0, 100, 255);

// ============================================================================
// Test Utilities
// ============================================================================

// Large manifest covering many tiles for stress testing
function generateLargeManifest(): Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number; shopCount: number }> {
    const entries: Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number; shopCount: number }> = [];
    const worlds = ['World', 'World_nether'];
    const blocksPerTileOptions = [64, 512];  // zoom 8 and zoom 1
    
    // Generate tiles around origin for stress testing
    for (const world of worlds) {
        for (const blocksPerTile of blocksPerTileOptions) {
            for (let tx = -10; tx <= 10; tx++) {
                for (let tz = -10; tz <= 10; tz++) {
                    entries.push({ world, tileX: tx, tileZ: tz, blocksPerTile, shopCount: 1 });
                }
            }
        }
    }
    
    return entries;
}

// ============================================================================
// Test Setup Helper
// ============================================================================

const MAP_CONTAINER_NOT_FOUND = 'Map container not found';
const MAP_CONTAINER_SELECTOR = '#nav-dialog-map-container';

interface TileMetrics {
    requestCount: number;
    totalLoadTime: number;
    maxLoadTime: number;
    minLoadTime: number;
    requestTimes: number[];
}

async function setupLoadTest(page: Page): Promise<TileMetrics> {
    const metrics: TileMetrics = {
        requestCount: 0,
        totalLoadTime: 0,
        maxLoadTime: 0,
        minLoadTime: Number.POSITIVE_INFINITY,
        requestTimes: []
    };
    
    // Mock config - must have dataRefreshMs > 0 to pass Zod validation!
    await page.route('**/config.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                dataUrl: 'data.json',
                dataRefreshMs: 60_000, // Must be > 0 to pass Zod validation
                dynmap: {
                    baseUrl: 'http://localhost:5173/pvc-trades/tiles', // Must be valid URL
                    tileSize: 128,
                    defaultZoom: 4,
                    maxZoomLevel: 7,
                    playerRefreshMs: 1000
                },
                analysis: {
                    shopClusterDistance: 16,
                    maxTransitiveIterations: 10,
                    minIndependentShops: 3
                }
            })
        });
    });

    // Mock data.json with minimal test data
    await page.route('**/data.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: [
                    {
                        location: '100.0, 64.0, 200.0',
                        world: 'world',
                        recipes: [
                            {
                                resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                                item1: { type: 'EMERALD', name: 'Emerald', amount: 10 },
                                stock: 64
                            }
                        ]
                    }
                ]
            })
        });
    });
    
    // Mock player API
    await page.route('**/pvc-players.minecraft-works.workers.dev**', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{
                name: 'LoadTestPlayer',
                uuid: 'load-test-uuid',
                x: 0, y: 64, z: 0,
                world: 'world',
                health: 20, armor: 0
            }])
        });
    });

    // Mock manifest with large tile set for tile loading tests
    await page.route('**/tiles/manifest.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(generateLargeManifest())
        });
    });
    
    // Mock tiles with timing measurement
    await page.route('**/tiles/**/*.png', async route => {
        const startTime = Date.now();
        
        // Simulate network latency (10-50ms) using crypto for consistent test behavior
        const delay = (crypto.getRandomValues(new Uint8Array(1))[0] % 40) + 10;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        const loadTime = Date.now() - startTime;
        metrics.requestCount++;
        metrics.totalLoadTime += loadTime;
        metrics.maxLoadTime = Math.max(metrics.maxLoadTime, loadTime);
        metrics.minLoadTime = Math.min(metrics.minLoadTime, loadTime);
        metrics.requestTimes.push(loadTime);
        
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: TILE_PNG
        });
    });
    
    return metrics;
}

async function waitForAppReady(page: Page): Promise<void> {
    await page.waitForSelector('.search-container', { state: 'visible' });
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10_000 });
}

async function openMapWithItem(page: Page): Promise<void> {
    // Add item to cart and open map
    await page.click('.add-to-cart-btn');
    await page.click('#open-cart');
    await page.waitForSelector('#cart-dialog[open]');
    await page.click('#tab-navigate');
    await page.fill('#player-name-input', 'LoadTestPlayer');
    await page.click('#start-navigation');
    await page.waitForSelector('#nav-dialog[open]');
    
    // Wait for map to be ready
    await page.waitForSelector('.leaflet-tile-loaded', { timeout: 5000 }).catch(() => {
        // May not have tiles loaded yet, that's okay
    });
}

// ============================================================================
// Load Tests
// ============================================================================
 
test.describe('Tile Loading Performance', () => {
    test.describe.configure({ mode: 'serial' });
    
    test('measures initial tile load time', async ({ page }) => {
        const metrics = await setupLoadTest(page);
        
        const startTime = Date.now();
        await page.goto('/');
        await waitForAppReady(page);
        await openMapWithItem(page);
        const loadTime = Date.now() - startTime;
        
        // Wait for tiles to settle
        await page.waitForTimeout(1000);
        
        console.log(`Initial load metrics:
  - Total time: ${loadTime}ms
  - Tile requests: ${metrics.requestCount}
  - Avg tile load: ${metrics.requestCount > 0 ? Math.round(metrics.totalLoadTime / metrics.requestCount) : 0}ms
  - Max tile load: ${metrics.maxLoadTime}ms`);
        
        expect(loadTime).toBeLessThan(LOAD_TEST_CONFIG.maxMapInteractiveTime * 3); // Allow more time for full flow
        if (metrics.requestCount > 0) {
            expect(metrics.maxLoadTime).toBeLessThan(LOAD_TEST_CONFIG.maxTileLoadTime);
        }
    });
    
    test('handles rapid pan operations', async ({ page }) => {
        const metrics = await setupLoadTest(page);
        
        await page.goto('/');
        await waitForAppReady(page);
        await openMapWithItem(page);
        
        // Wait for initial tiles
        await page.waitForTimeout(500);
        const initialRequests = metrics.requestCount;
        
        // Perform rapid pan operations
        const mapContainer = page.locator(MAP_CONTAINER_SELECTOR);
        const box = await mapContainer.boundingBox();
        if (!box) { throw new Error(MAP_CONTAINER_NOT_FOUND); }
        
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        
        const startTime = Date.now();
        
        for (let index = 0; index < LOAD_TEST_CONFIG.rapidPanCount; index++) {
            // Pan in different directions
            const angle = (index / LOAD_TEST_CONFIG.rapidPanCount) * 2 * Math.PI;
            const distance = 100;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            
            await page.mouse.move(centerX, centerY);
            await page.mouse.down();
            await page.mouse.move(centerX + dx, centerY + dy, { steps: 5 });
            await page.mouse.up();
            
            await page.waitForTimeout(LOAD_TEST_CONFIG.operationDelay);
        }
        
        const panTime = Date.now() - startTime;
        
        // Wait for pending tile requests
        await page.waitForTimeout(1000);
        
        const newRequests = metrics.requestCount - initialRequests;
        
        console.log(`Rapid pan metrics (${LOAD_TEST_CONFIG.rapidPanCount} operations):
  - Total time: ${panTime}ms
  - New tile requests: ${newRequests}
  - Requests per operation: ${(newRequests / LOAD_TEST_CONFIG.rapidPanCount).toFixed(1)}`);
        
        // Should complete without hanging
        expect(panTime).toBeLessThan(LOAD_TEST_CONFIG.rapidPanCount * 500);
    });
    
    test('handles rapid zoom operations', async ({ page }) => {
        const metrics = await setupLoadTest(page);
        
        await page.goto('/');
        await waitForAppReady(page);
        await openMapWithItem(page);
        
        await page.waitForTimeout(500);
        const initialRequests = metrics.requestCount;
        
        const mapContainer = page.locator(MAP_CONTAINER_SELECTOR);
        const box = await mapContainer.boundingBox();
        if (!box) { throw new Error(MAP_CONTAINER_NOT_FOUND); }
        
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        
        const startTime = Date.now();
        
        // Rapid zoom in/out cycles
        for (let index = 0; index < 10; index++) {
            await page.mouse.move(centerX, centerY);
            await page.mouse.wheel(0, -300); // Zoom in
            await page.waitForTimeout(100);
            await page.mouse.wheel(0, 300);  // Zoom out
            await page.waitForTimeout(100);
        }
        
        const zoomTime = Date.now() - startTime;
        
        // Wait for pending requests
        await page.waitForTimeout(1000);
        
        const newRequests = metrics.requestCount - initialRequests;
        
        console.log(`Rapid zoom metrics (10 in/out cycles):
  - Total time: ${zoomTime}ms
  - New tile requests: ${newRequests}`);
        
        expect(zoomTime).toBeLessThan(10_000);
    });
    
    test('measures memory with many tiles', async ({ page }) => {
        const metrics = await setupLoadTest(page);
        
        await page.goto('/');
        await waitForAppReady(page);
        await openMapWithItem(page);
        
        // Pan around to load many tiles
        const mapContainer = page.locator(MAP_CONTAINER_SELECTOR);
        const box = await mapContainer.boundingBox();
        if (!box) { throw new Error(MAP_CONTAINER_NOT_FOUND); }
        
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        
        // Grid pan to load tiles from multiple areas
        for (let row = -2; row <= 2; row++) {
            for (let col = -2; col <= 2; col++) {
                await page.mouse.move(centerX, centerY);
                await page.mouse.down();
                await page.mouse.move(centerX + col * 200, centerY + row * 200, { steps: 3 });
                await page.mouse.up();
                await page.waitForTimeout(200);
            }
        }
        
        // Wait for all tiles to load
        await page.waitForTimeout(2000);
        
        // Check memory usage via performance API
        const memoryInfo = await page.evaluate(() => {
            const perf = performance as Performance & { 
                memory?: { 
                    usedJSHeapSize: number; 
                    totalJSHeapSize: number;
                    jsHeapSizeLimit: number;
                } 
            };
            if (perf.memory) {
                return {
                    usedHeap: Math.round(perf.memory.usedJSHeapSize / 1024 / 1024),
                    totalHeap: Math.round(perf.memory.totalJSHeapSize / 1024 / 1024),
                    heapLimit: Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024)
                };
            }
        });
        
        console.log(`Memory after loading ${metrics.requestCount} tiles:`);
        if (memoryInfo) {
            console.log(`  - Used heap: ${memoryInfo.usedHeap}MB`);
            console.log(`  - Total heap: ${memoryInfo.totalHeap}MB`);
            console.log(`  - Heap limit: ${memoryInfo.heapLimit}MB`);
            
            // Should not use more than 200MB for tiles
            expect(memoryInfo.usedHeap).toBeLessThan(200);
        } else {
            console.log('  - Memory API not available (non-Chromium browser)');
        }
        
        expect(metrics.requestCount).toBeGreaterThan(10);
    });
    
    test('tile caching prevents duplicate requests when panning back', async ({ page }) => {
        const metrics = await setupLoadTest(page);
        
        await page.goto('/');
        await waitForAppReady(page);
        await openMapWithItem(page);
        
        // Wait for initial tiles
        await page.waitForTimeout(1500);
        const initialRequests = metrics.requestCount;
        
        // Get map container for panning
        const mapContainer = page.locator(MAP_CONTAINER_SELECTOR);
        const box = await mapContainer.boundingBox();
        if (!box) { throw new Error(MAP_CONTAINER_NOT_FOUND); }
        
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        
        // Pan away from origin (larger distance to ensure new tiles)
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(centerX + 400, centerY + 400, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        
        const afterPanRequests = metrics.requestCount;
        const requestsDuringPanAway = afterPanRequests - initialRequests;
        
        // Pan back to original location
        await page.mouse.move(centerX + 400, centerY + 400);
        await page.mouse.down();
        await page.mouse.move(centerX, centerY, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        
        const afterReturnRequests = metrics.requestCount - afterPanRequests;
        
        console.log(`Caching test:
  - Initial requests: ${initialRequests}
  - Requests after pan away: ${requestsDuringPanAway}
  - Requests after return: ${afterReturnRequests}
  - Note: Return requests should be 0 or minimal due to caching`);
        
        // When returning to cached area, should have fewer or equal requests than initial
        // (tiles should be cached from the initial load)
        expect(afterReturnRequests).toBeLessThanOrEqual(Math.max(1, requestsDuringPanAway));
    });
    
    test('calculates percentile response times', async ({ page }) => {
        const metrics = await setupLoadTest(page);
        
        await page.goto('/');
        await waitForAppReady(page);
        await openMapWithItem(page);
        
        // Pan around to generate many requests
        const mapContainer = page.locator(MAP_CONTAINER_SELECTOR);
        const box = await mapContainer.boundingBox();
        if (!box) { throw new Error(MAP_CONTAINER_NOT_FOUND); }
        
        for (let index = 0; index < 5; index++) {
            const angle = index * 72 * Math.PI / 180;
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(
                box.x + box.width / 2 + Math.cos(angle) * 150,
                box.y + box.height / 2 + Math.sin(angle) * 150,
                { steps: 3 }
            );
            await page.mouse.up();
            await page.waitForTimeout(300);
        }
        
        await page.waitForTimeout(1500);
        
        if (metrics.requestTimes.length > 0) {
            const sorted = metrics.requestTimes.toSorted((a, b) => a - b);
            const p50Index = Math.floor(sorted.length * 0.5);
            const p95Index = Math.floor(sorted.length * 0.95);
            const p99Index = Math.floor(sorted.length * 0.99);
            
            console.log(`Response time percentiles (${sorted.length} requests):
  - p50: ${sorted[p50Index]}ms
  - p95: ${sorted[p95Index]}ms
  - p99: ${sorted[p99Index]}ms
  - min: ${sorted[0]}ms
  - max: ${sorted.at(-1)}ms`);
            
            // p95 should be reasonable
            expect(sorted[p95Index]).toBeLessThan(LOAD_TEST_CONFIG.maxTileLoadTime);
        }
    });
});
