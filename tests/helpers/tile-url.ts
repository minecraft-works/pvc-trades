/**
 * Squaremap tile URL helpers shared by Playwright specs and BDD steps.
 *
 * The app requests tiles straight from the map server at
 * `{baseUrl}/tiles/minecraft_{world}/{zoom}/{tileX}_{tileZ}.png`.
 * Server zoom 8 is the detail level (512 blocks per tile) and zoom 4 is the
 * overview level (8192 blocks per tile).
 *
 * @module tests/helpers/tile-url
 */

import { createColoredPng } from './png-utilities.js';

/** Server zoom of the detail pyramid level */
export const DETAIL_ZOOM = 8;

/** Server zoom of the overview pyramid level */
export const OVERVIEW_ZOOM = 4;

/** Blocks covered by one detail tile edge */
export const DETAIL_BPT = 512;

/** Blocks covered by one overview tile edge */
export const OVERVIEW_BPT = 8192;

/** Number of detail tiles along one overview tile edge */
export const DETAIL_TILES_PER_OVERVIEW = OVERVIEW_BPT / DETAIL_BPT;

/** Worlds the map server publishes tiles for */
export type TileWorld = 'overworld' | 'the_nether' | 'the_end';

/** A tile URL broken down into its components */
export interface ParsedTileUrl {
    world: TileWorld;
    /** Server zoom (8 = detail, 4 = overview) */
    zoom: number;
    /** Blocks covered by one tile edge at this zoom */
    blocksPerTile: number;
    tileX: number;
    tileZ: number;
}

const TILE_URL_PATTERN = /\/tiles\/minecraft_(?<world>overworld|the_nether|the_end)\/(?<zoom>\d+)\/(?<tileX>-?\d+)_(?<tileZ>-?\d+)\.png/;

/**
 * Blocks per tile edge at a server zoom.
 *
 * @param zoom - Server zoom
 * @returns Blocks per tile edge
 */
export function blocksPerTileForZoom(zoom: number): number {
    return DETAIL_BPT * 2 ** (DETAIL_ZOOM - zoom);
}

/**
 * Parse a tile URL requested by the app.
 *
 * @param url - Absolute tile URL
 * @returns Parsed components, or undefined if the URL is not a tile URL
 */
export function parseTileUrl(url: string): ParsedTileUrl | undefined {
    const groups = TILE_URL_PATTERN.exec(url)?.groups;
    if (!groups) { return undefined; }
    const { world, zoom: zoomText, tileX, tileZ } = groups;
    if (!world || !zoomText || !tileX || !tileZ) { return undefined; }
    const zoom = Number.parseInt(zoomText, 10);
    return {
        world: world as TileWorld,
        zoom,
        blocksPerTile: blocksPerTileForZoom(zoom),
        tileX: Number.parseInt(tileX, 10),
        tileZ: Number.parseInt(tileZ, 10),
    };
}

/**
 * Parse every tile URL in a list, dropping anything that is not a tile URL.
 *
 * @param urls - Request URLs
 * @returns Parsed tiles in request order
 */
export function parseTileUrls(urls: readonly string[]): ParsedTileUrl[] {
    const tiles: ParsedTileUrl[] = [];
    for (const url of urls) {
        const parsed = parseTileUrl(url);
        if (parsed) { tiles.push(parsed); }
    }
    return tiles;
}

/**
 * Whether a request URL is a map tile request.
 *
 * @param url - Request URL
 * @returns True for Squaremap tile URLs
 */
export function isTileRequestUrl(url: string): boolean {
    return TILE_URL_PATTERN.test(url);
}

/**
 * Short world label used by request trackers.
 *
 * @param url - Tile request URL
 * @returns `nether` for nether tiles, otherwise `overworld`
 */
export function tileWorldLabel(url: string): 'nether' | 'overworld' {
    return url.includes('/minecraft_the_nether/') ? 'nether' : 'overworld';
}

/**
 * Build the URL path fragment of a tile (without the server base URL).
 *
 * @param tile - World, zoom and tile coordinates
 * @param tile.world - Tile world
 * @param tile.zoom - Server zoom
 * @param tile.tileX - Tile X coordinate
 * @param tile.tileZ - Tile Z coordinate
 * @returns Fragment like `/tiles/minecraft_overworld/8/3_-2.png`
 */
export function tilePathFragment(tile: { world: TileWorld; zoom: number; tileX: number; tileZ: number }): string {
    return `/tiles/minecraft_${tile.world}/${String(tile.zoom)}/${String(tile.tileX)}_${String(tile.tileZ)}.png`;
}

// ============================================================================
// Colour-coded tiles
// ============================================================================
// World (hue): blue = overworld, red = nether.
// Zoom (brightness): bright = detail, dark = overview.
// Checkerboard: odd tiles are 15% darker.

/** RGB triple */
interface TileColor {
    r: number;
    g: number;
    b: number;
}

const TILE_COLORS = {
    overworld: {
        detail: { r: 100, g: 180, b: 255 },
        overview: { r: 40, g: 80, b: 140 },
    },
    the_nether: {
        detail: { r: 255, g: 120, b: 100 },
        overview: { r: 140, g: 50, b: 40 },
    },
    the_end: {
        detail: { r: 220, g: 220, b: 160 },
        overview: { r: 110, g: 110, b: 80 },
    },
} as const;

/**
 * Colour of the colour-coded mock tile for a parsed tile URL.
 *
 * @param tile - Parsed tile URL
 * @returns RGB colour of the tile
 */
export function colorForTile(tile: ParsedTileUrl): TileColor {
    const base = TILE_COLORS[tile.world][tile.zoom === DETAIL_ZOOM ? 'detail' : 'overview'];
    const multiplier = (tile.tileX + tile.tileZ) % 2 === 0 ? 1 : 0.85;
    return {
        r: Math.round(base.r * multiplier),
        g: Math.round(base.g * multiplier),
        b: Math.round(base.b * multiplier),
    };
}

/**
 * Colour-coded PNG for a parsed tile URL.
 *
 * @param tile - Parsed tile URL
 * @returns PNG file contents
 */
export function createEncodedTilePng(tile: ParsedTileUrl): Buffer {
    const { r, g, b } = colorForTile(tile);
    return createColoredPng(r, g, b);
}
