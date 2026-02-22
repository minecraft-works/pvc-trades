#!/usr/bin/env npx tsx
/**
 * Tile Validation Script
 * 
 * Validates tile integrity after fetch-tiles.ts runs:
 * 1. Every manifest entry has a corresponding file on disk
 * 2. Every tile file is listed in the manifest
 * 3. Shops have expected tiles (warning only, not failure)
 * 
 * Exit codes:
 * - 0: All validations passed (shop coverage warnings are OK)
 * - 1: Manifest/file integrity errors (hard failure)
 * 
 * @example
 * npx tsx scripts/validate-tiles.ts
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
    getTileCoordsAtZoom,
    getTileNeighborhood,
    parseLocation} from '../src/tile-coords.js';

// ============================================================================
// Configuration
// ============================================================================

const TILES_DIR = 'public/tiles';
const MANIFEST_PATH = path.join(TILES_DIR, 'manifest.json');
const DATA_PATH = 'public/data.json';

const TILE_SIZE = 512;
const MAX_ZOOM = 8;
const DETAIL_ZOOM = 8;  // Zoom level for tiles around shops

interface ManifestEntry {
    world: string;
    tileX: number;
    tileZ: number;
    blocksPerTile: number;
    shopCount?: number;
}

interface ShopData {
    shopName: string;
    location: string;
    world: string;
}

// ============================================================================
// File Scanning
// ============================================================================

/**
 * Recursively scan a directory for PNG files
 */
function scanPngFiles(dir: string, baseDir: string = dir): string[] {
    const files: string[] = [];
    
    if (!existsSync(dir)) {
        return files;
    }
    
    for (const entry of readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
            files.push(...scanPngFiles(fullPath, baseDir));
        } else if (entry.endsWith('.png')) {
            // Normalize path separators to forward slashes (matching manifest format)
            const relativePath = path.relative(baseDir, fullPath).replaceAll('\\', '/');
            files.push(relativePath);
        }
    }
    
    return files;
}

/**
 * Parse a tile path like "overworld/8/0/0.png" into components
 */
function parseTilePath(tilePath: string): { world: string; zoom: number; tileX: number; tileZ: number } | undefined {
    // Format: {world}/{zoom}/{x}/{z}.png
    const regex = /^([^/]+)\/(\d+)\/(-?\d+)\/(-?\d+)\.png$/;
    const match = regex.exec(tilePath);
    if (!match) {
        return undefined;
    }
    
    return {
        world: match[1]!,
        zoom: Number.parseInt(match[2]!, 10),
        tileX: Number.parseInt(match[3]!, 10),
        tileZ: Number.parseInt(match[4]!, 10)
    };
}

/**
 * Convert manifest entry to file path
 */
function manifestEntryToPath(entry: ManifestEntry): string {
    // Calculate zoom from blocksPerTile
    // blocksPerTile = tileSize × 2^(maxZoom - zoom)
    // So: 2^(maxZoom - zoom) = blocksPerTile / tileSize
    // maxZoom - zoom = log2(blocksPerTile / tileSize)
    // zoom = maxZoom - log2(blocksPerTile / tileSize)
    const zoom = MAX_ZOOM - Math.log2(entry.blocksPerTile / TILE_SIZE);
    const normalizedWorld = normalizeWorld(entry.world);
    return `${normalizedWorld}/${zoom}/${entry.tileX}/${entry.tileZ}.png`;
}

/**
 * Normalize world name to directory format
 */
function normalizeWorld(world: string): string {
    const lower = world.toLowerCase();
    if (lower === 'world' || lower === 'overworld' || lower === 'minecraft_overworld') {
        return 'overworld';
    }
    if (lower.includes('nether')) {
        return 'the_nether';
    }
    if (lower.includes('end')) {
        return 'the_end';
    }
    return world;
}

// ============================================================================
// Validation Logic
// ============================================================================

const MANIFEST_ZOOM = 8; // Manifest only tracks zoom 8 tiles

function validateManifestIntegrity(manifest: ManifestEntry[], tileFiles: Set<string>): {
    missingFiles: string[];
    orphanedZoom8Files: string[];
    otherZoomFiles: number;
} {
    const manifestPaths = new Set(manifest.map(manifestEntryToPath));
    
    const missingFiles: string[] = [];
    const orphanedZoom8Files: string[] = [];
    let otherZoomFiles = 0;
    
    // Check each manifest entry has a file
    for (const path of manifestPaths) {
        if (!tileFiles.has(path)) {
            missingFiles.push(path);
        }
    }
    
    // Check each file - only zoom 8 files should be in manifest
    for (const file of tileFiles) {
        const parsed = parseTilePath(file);
        if (!parsed) {continue;}
        
        if (parsed.zoom === MANIFEST_ZOOM) {
            if (!manifestPaths.has(file)) {
                orphanedZoom8Files.push(file);
            }
        } else {
            otherZoomFiles++;
        }
    }
    
    return { missingFiles, orphanedZoom8Files, otherZoomFiles };
}

function validateShopCoverage(shops: ShopData[], manifest: ManifestEntry[]): Array<{
    shop: string;
    world: string;
    location: string;
    missingTiles: string[];
}> {
    const shopsMissingTiles: Array<{
        shop: string;
        world: string;
        location: string;
        missingTiles: string[];
    }> = [];
    
    // Build a set of manifest keys for quick lookup
    const manifestKeys = new Set<string>();
    for (const entry of manifest) {
        const normalizedWorld = normalizeWorld(entry.world);
        const key = `${normalizedWorld}/${entry.blocksPerTile}/${entry.tileX}/${entry.tileZ}`;
        manifestKeys.add(key);
    }
    
    // Check each shop
    for (const shop of shops) {
        const coords = parseLocation(shop.location);
        const world = normalizeWorld(shop.world);
        
        // Get the tile containing this shop
        const { tileX, tileZ, blocksPerTile } = getTileCoordsAtZoom(
            coords.x, coords.z, DETAIL_ZOOM, MAX_ZOOM, TILE_SIZE
        );
        
        // Get 5×5 neighborhood
        const neighborhood = getTileNeighborhood(tileX, tileZ);
        
        const missingTiles: string[] = [];
        for (const tile of neighborhood) {
            const key = `${world}/${blocksPerTile}/${tile.tileX}/${tile.tileZ}`;
            if (!manifestKeys.has(key)) {
                missingTiles.push(`${tile.tileX},${tile.tileZ}`);
            }
        }
        
        if (missingTiles.length > 0) {
            shopsMissingTiles.push({
                shop: shop.shopName,
                world,
                location: shop.location,
                missingTiles
            });
        }
    }
    
    return shopsMissingTiles;
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
    console.log('=== Tile Validation ===\n');
    
    // Check paths exist
    if (!existsSync(TILES_DIR)) {
        console.error(`Error: Tiles directory not found: ${TILES_DIR}`);
        console.error('Run fetch-tiles.ts first.');
        process.exit(1);
    }
    
    if (!existsSync(MANIFEST_PATH)) {
        console.error(`Error: Manifest not found: ${MANIFEST_PATH}`);
        console.error('Run fetch-tiles.ts first.');
        process.exit(1);
    }
    
    // Load manifest
    const manifest: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    console.log(`Manifest entries: ${manifest.length}`);
    
    // Scan tile files
    const tileFilesArray = scanPngFiles(TILES_DIR);
    const tileFiles = new Set(tileFilesArray);
    console.log(`Tile files on disk: ${tileFiles.size}`);
    
    // Validate manifest ↔ file integrity
    console.log('\n--- Manifest Integrity ---');
    const { missingFiles, orphanedZoom8Files, otherZoomFiles } = validateManifestIntegrity(manifest, tileFiles);
    
    let hasErrors = false;
    
    if (missingFiles.length > 0) {
        console.error(`\nERROR: ${missingFiles.length} manifest entries have no file:`);
        for (const file of missingFiles.slice(0, 10)) {
            console.error(`  - ${file}`);
        }
        if (missingFiles.length > 10) {
            console.error(`  ... and ${missingFiles.length - 10} more`);
        }
        hasErrors = true;
    } else {
        console.log('All manifest entries have corresponding files.');
    }
    
    if (orphanedZoom8Files.length > 0) {
        console.warn(`\nWARNING: ${orphanedZoom8Files.length} zoom-8 files not in manifest (orphaned from previous runs):`);
        for (const file of orphanedZoom8Files.slice(0, 10)) {
            console.warn(`  - ${file}`);
        }
        if (orphanedZoom8Files.length > 10) {
            console.warn(`  ... and ${orphanedZoom8Files.length - 10} more`);
        }
        // Orphan files are harmless - just cached tiles from shops that moved/were removed
    } else {
        console.log('All zoom-8 tile files are listed in manifest.');
    }
    
    if (otherZoomFiles > 0) {
        console.log(`(${otherZoomFiles} tiles at other zoom levels are not tracked in manifest - expected)`);
    }
    
    // Validate shop coverage (warnings only)
    if (existsSync(DATA_PATH)) {
        console.log('\n--- Shop Coverage ---');
        const shopData = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
        const shops: ShopData[] = shopData.data || [];
        console.log(`Shops in data.json: ${shops.length}`);
        
        const shopsMissingTiles = validateShopCoverage(shops, manifest);
        
        if (shopsMissingTiles.length > 0) {
            console.warn(`\nWARNING: ${shopsMissingTiles.length} shops have incomplete tile coverage:`);
            
            // Group by severity (more missing = more severe)
            const sorted = [...shopsMissingTiles].toSorted((a, b) => b.missingTiles.length - a.missingTiles.length);
            
            for (const { shop, world, location, missingTiles } of sorted.slice(0, 20)) {
                console.warn(`  - ${shop} (${world} @ ${location}): missing ${missingTiles.length}/25 tiles`);
            }
            if (sorted.length > 20) {
                console.warn(`  ... and ${sorted.length - 20} more shops`);
            }
            
            // Summary by world
            const byWorld = new Map<string, number>();
            for (const { world } of shopsMissingTiles) {
                byWorld.set(world, (byWorld.get(world) || 0) + 1);
            }
            console.warn('\n  By world:');
            for (const [world, count] of byWorld) {
                console.warn(`    ${world}: ${count} shops with missing tiles`);
            }
        } else {
            console.log('All shops have complete tile coverage.');
        }
    } else {
        console.log(`\nSkipping shop coverage check (${DATA_PATH} not found)`);
    }
    
    // Exit
    console.log('\n=== Validation Complete ===');
    if (hasErrors) {
        console.error('\nFailed: Manifest/file integrity errors found.');
        process.exit(1);
    } else {
        console.log('\nPassed: All integrity checks OK.');
        process.exit(0);
    }
}

main();
