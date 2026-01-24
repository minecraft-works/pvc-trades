/**
 * Test helpers for multi-world navigation scenarios
 * Provides mocks for player API and colored tile generation
 */

import type { Page, Route } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/**
 * Create a 1x1 PNG with a specific color
 * PNG format: 8-byte header + IHDR + IDAT + IEND
 */
function createColoredPng(r: number, g: number, b: number): Buffer {
    // Minimal 1x1 PNG with specified RGB color
    // This is a valid PNG file structure
    const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk: width=1, height=1, bit depth=8, color type=2 (RGB)
    const ihdrData = Buffer.from([
        0x00, 0x00, 0x00, 0x01, // width
        0x00, 0x00, 0x00, 0x01, // height
        0x08, // bit depth
        0x02, // color type (RGB)
        0x00, // compression
        0x00, // filter
        0x00  // interlace
    ]);
    const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
    const ihdr = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x0D]), // length
        Buffer.from('IHDR'),
        ihdrData,
        ihdrCrc
    ]);
    
    // IDAT chunk: compressed image data
    // For 1x1 RGB: filter byte (0) + R + G + B, then deflate compressed
    const rawData = Buffer.from([0x00, r, g, b]); // filter byte + RGB
    const compressed = deflateSync(rawData);
    const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
    const idat = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from('IDAT'),
        compressed,
        idatCrc
    ]);
    idat.writeUInt32BE(compressed.length, 0);
    
    // IEND chunk
    const iendCrc = crc32(Buffer.from('IEND'));
    const iend = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // length
        Buffer.from('IEND'),
        iendCrc
    ]);
    
    return Buffer.concat([header, ihdr, idat, iend]);
}

// CRC32 lookup table
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

function crc32(data: Buffer): Buffer {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
    }
    crc = crc ^ 0xffffffff;
    const result = Buffer.alloc(4);
    result.writeUInt32BE(crc >>> 0, 0);
    return result;
}

// Blue (RGB: 0, 100, 255) for overworld
const BLUE_PIXEL_PNG = createColoredPng(0, 100, 255);
// Red (RGB: 255, 50, 50) for nether  
const RED_PIXEL_PNG = createColoredPng(255, 50, 50);

export interface PlayerState {
    uuid: string;
    name: string;
    foreign: boolean;
    position: {
        x: number;
        y: number;
        z: number;
    };
    rotation?: {
        pitch: number;
        yaw: number;
        roll: number;
    };
    world?: string;
}

export interface PlayerMock {
    /** Current player state */
    state: PlayerState;
    /** Update player position/world */
    setPosition(x: number, z: number, world?: string): void;
    /** Move player to nether */
    moveToNether(x?: number, z?: number): void;
    /** Move player to overworld */
    moveToOverworld(x?: number, z?: number): void;
}

/**
 * Creates a controllable player mock
 */
export function createPlayerMock(initialWorld: string = 'World'): PlayerMock {
    const state: PlayerState = {
        uuid: 'test-uuid-1234',
        name: 'TestPlayer',
        foreign: false,
        position: {
            x: 0,
            y: 64,
            z: 0
        },
        rotation: {
            pitch: 0,
            yaw: 0,
            roll: 0
        },
        world: initialWorld
    };

    return {
        state,
        setPosition(x: number, z: number, world?: string) {
            state.position.x = x;
            state.position.z = z;
            if (world) {
                state.world = world;
            }
        },
        moveToNether(x = -100, z = -12) {
            state.position.x = x;
            state.position.z = z;
            state.world = 'World_nether';
        },
        moveToOverworld(x = 0, z = 0) {
            state.position.x = x;
            state.position.z = z;
            state.world = 'World';
        }
    };
}

/**
 * Sets up player API mock that returns the current player state
 */
export async function setupPlayerApiMock(page: Page, playerMock: PlayerMock): Promise<void> {
    await page.route('**/pvc-players.minecraft-works.workers.dev**', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                players: [playerMock.state]
            })
        });
    });
}

/**
 * Sets up colored tile mocks based on world in URL
 * - Overworld tiles: Blue
 * - Nether tiles: Red
 */
export async function setupColoredTileMocks(page: Page): Promise<void> {
    await page.route('**/tiles/**/*.png', async (route: Route) => {
        const url = route.request().url();
        const isNether = url.includes('/the_nether/');
        
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: isNether ? RED_PIXEL_PNG : BLUE_PIXEL_PNG
        });
    });

    // Mock the manifest with entries for common tile coordinates
    // This ensures tiles will be loaded by the app
    await page.route('**/tiles/manifest.json', async (route: Route) => {
        const manifestEntries: Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number }> = [];
        
        // Generate manifest entries for a range of tiles around 0,0 and nether shop location
        const worlds = ['overworld', 'the_nether'];
        const blocksPerTileOptions = [512, 8192]; // zoom 8 and zoom 4
        
        for (const world of worlds) {
            for (const blocksPerTile of blocksPerTileOptions) {
                // Cover tiles around origin and common test locations
                for (let tx = -10; tx <= 10; tx++) {
                    for (let tz = -10; tz <= 10; tz++) {
                        manifestEntries.push({ world, tileX: tx, tileZ: tz, blocksPerTile });
                    }
                }
            }
        }
        
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(manifestEntries)
        });
    });
}

/**
 * Mock data with shops in both overworld and nether
 */
export const MULTI_WORLD_SHOP_DATA = {
    data: [
        {
            shopName: 'Overworld Shop',
            shopOwner: 'TestOwner',
            location: '100.0, 64.0, 200.0',
            world: 'World',
            recipes: [
                {
                    resultItem: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                    item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                    stock: 10
                }
            ]
        },
        {
            shopName: 'Nether Shop',
            shopOwner: 'NetherOwner', 
            location: '-683.0, 80.0, -101.0',
            world: 'World_nether',
            recipes: [
                {
                    resultItem: { type: 'NETHERITE_SCRAP', name: 'Netherite Scrap', amount: 1 },
                    item1: { type: 'GOLD_INGOT', name: 'Gold Ingot', amount: 8 },
                    stock: 5
                }
            ]
        }
    ]
};

/**
 * Sets up data.json mock with multi-world shops
 */
export async function setupMultiWorldDataMock(page: Page): Promise<void> {
    await page.route('**/data.json', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MULTI_WORLD_SHOP_DATA)
        });
    });
}

/**
 * RGB color type
 */
export interface RGB {
    r: number;
    g: number;
    b: number;
}

/**
 * Sample a pixel color from the navigation map canvas
 * Leaflet renders to a container with multiple image overlays
 * Note: Leaflet uses blob URLs, so we can't filter by original URL path
 */
export async function sampleMapColor(page: Page): Promise<RGB | null> {
    // Wait for the map container to be visible
    const container = page.locator('#nav-dialog-map-container');
    await container.waitFor({ state: 'visible', timeout: 5000 });

    // Sample color from the center of any loaded tile image
    const color = await page.evaluate(() => {
        const container = document.getElementById('nav-dialog-map-container');
        if (!container) {
            console.log('[sampleMapColor] No container found');
            return null;
        }

        // Find any image overlay in the Leaflet pane
        const images = container.querySelectorAll('.leaflet-image-layer') as NodeListOf<HTMLImageElement>;
        console.log(`[sampleMapColor] Found ${images.length} image layers`);
        
        if (images.length === 0) {
            return null;
        }
        
        // Find a loaded image
        for (const img of images) {
            if (!img.complete || img.naturalWidth === 0) {
                continue;
            }
            
            // Create canvas to sample the image
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                continue;
            }

            try {
                ctx.drawImage(img, 0, 0, 1, 1);
                const pixel = ctx.getImageData(0, 0, 1, 1).data;
                console.log(`[sampleMapColor] Sampled pixel: R=${pixel[0]}, G=${pixel[1]}, B=${pixel[2]}`);
                return { r: pixel[0], g: pixel[1], b: pixel[2] };
            } catch (e) {
                console.log('[sampleMapColor] Error sampling image:', e);
                // CORS or other error, try next image
                continue;
            }
        }
        
        console.log('[sampleMapColor] No valid image found to sample');
        return null;
    });

    return color;
}

/**
 * Check if the map is showing overworld (blue-ish color)
 */
export function isBlueColor(color: RGB | null): boolean {
    if (!color) {
        return false;
    }
    // Blue has high B, low R
    return color.b > 200 && color.r < 100;
}

/**
 * Check if the map is showing nether (red-ish color)
 */
export function isRedColor(color: RGB | null): boolean {
    if (!color) {
        return false;
    }
    // Red has high R, low B
    return color.r > 200 && color.b < 100;
}

/**
 * Wait for map to show a specific world color
 * Since Leaflet uses blob URLs, we can't filter by world URL
 * Instead, we just sample the color and check if it matches expectations
 */
export async function waitForMapWorld(
    page: Page, 
    expectedWorld: 'overworld' | 'nether',
    timeout: number = 10000
): Promise<boolean> {
    const checkColor = expectedWorld === 'overworld' ? isBlueColor : isRedColor;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        // Don't filter by world since blob URLs don't preserve the original path
        const color = await sampleMapColor(page);
        if (checkColor(color)) {
            return true;
        }
        await page.waitForTimeout(200);
    }
    
    return false;
}
