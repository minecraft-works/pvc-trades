/**
 * Type definitions for the Shop Trade Viewer application
 */

import { z } from 'zod';

// ============================================================================
// Animation Configuration (for testing)
// ============================================================================

/**
 * Global animation config that can be set by tests.
 * Set `globalThis.__animationsDisabled = true` before page load to disable animations.
 * 
 * @example
 * // In test fixtures:
 * await page.addInitScript(() => { globalThis.__animationsDisabled = true; });
 */
declare global {
     
    var __animationsDisabled: boolean | undefined;
}

/**
 * Check if animations should be disabled (for testing).
 * Respects both test flag and user's `prefers-reduced-motion` preference.
 * @returns True if animations should be suppressed
 */
export function shouldDisableAnimations(): boolean {
    // Check if running in browser environment
    if (!('window' in globalThis)) {
        return false;
    }
    return globalThis.__animationsDisabled === true;
}

// ============================================================================
// Configuration Types
// ============================================================================

const DynmapConfigSchema = z.object({
    baseUrl: z.url(),
    tileSize: z.number().int().positive(),
    defaultZoom: z.number().int().min(0).max(10),
    maxZoomLevel: z.number().int().positive(),
    playerRefreshMs: z.number().int().positive()
});

const BlueMapConfigSchema = z.object({
    baseUrl: z.url(),
    mapId: z.string().min(1).optional().default('world'),
    playerRefreshMs: z.number().int().positive()
});

const TilePyramidConfigSchema = z.object({
    /** Canonical tile width in pixels */
    tileWidth: z.number().int().positive().default(256),
    /** Canonical tile height in pixels */
    tileHeight: z.number().int().positive().default(256),
    /** Number of pyramid levels (higher = more detail tiers) */
    levels: z.number().int().min(1).max(10).default(3),
    /** Block coverage multiplier between adjacent levels */
    scaleFactor: z.number().int().min(2).max(32).default(4),
    /** Blocks per tile at the highest detail level */
    baseBlocksPerTile: z.number().int().positive().default(256),
    /** Output tile format */
    format: z.enum(['png', 'webp', 'avif']).default('png')
});

export type TilePyramidConfig = z.infer<typeof TilePyramidConfigSchema>;

const AnalysisConfigSchema = z.object({
    shopClusterDistance: z.number().positive(),
    maxTransitiveIterations: z.number().int().positive(),
    minIndependentShops: z.number().int().positive()
});

/** Tile source discriminator: 'dynmap' or 'bluemap' */
export const TileSourceSchema = z.enum(['dynmap', 'bluemap']).default('dynmap');
export type TileSource = z.infer<typeof TileSourceSchema>;

export const AppConfigSchema = z.object({
    dataUrl: z.string().min(1),
    dataRefreshMs: z.number().int().positive().optional().default(60_000),
    tileSource: TileSourceSchema,
    tilePyramid: TilePyramidConfigSchema.default({
        tileWidth: 256,
        tileHeight: 256,
        levels: 3,
        scaleFactor: 4,
        baseBlocksPerTile: 256,
        format: 'png' as const
    }),
    dynmap: DynmapConfigSchema,
    bluemap: BlueMapConfigSchema.optional(),
    analysis: AnalysisConfigSchema
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ============================================================================
// Block Conversions
// ============================================================================

const BlockConversionSchema = z.object({
    base: z.string(),
    multiplier: z.number().positive()
});

export const BlockConversionsSchema = z.record(z.string(), BlockConversionSchema);

export type BlockConversions = z.infer<typeof BlockConversionsSchema>;

// ============================================================================
// Trade Mapping Rules
// ============================================================================

export const MappingRuleSchema = z.object({
    item: z.string(),
    originalName: z.string().optional(),
    enchant: z.record(z.string(), z.number()).optional(),
    customName: z.string(),
    lore: z.string().optional()
});

export type MappingRule = z.infer<typeof MappingRuleSchema>;

// ============================================================================
// Item Types
// ============================================================================

export interface Item {
    readonly type: string;
    readonly name: string;
    readonly amount: number;
    readonly enchant?: Readonly<Record<string, number>>;
    readonly lore?: readonly string[];
}

export interface ShulkerItem {
    readonly key: string;
    readonly name: string;
    readonly total: number;
}

export interface ShulkerParseResult {
    items: ShulkerItem[];
    defaultName: string;
    defaultTotal: number;
}

// ============================================================================
// Shop & Recipe Types
// ============================================================================

export interface Recipe {
    resultItem: Item;
    item1: Item;
    item2?: Item;
    stock: number;
}

export interface Shop {
    location: string;
    world: string;
    recipes: Recipe[];
}

export interface ShopData {
    data: Shop[];
}

// ============================================================================
// Trade Types (Processed)
// ============================================================================

export interface Trade {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly world: string;
    readonly item1: Item;
    readonly item2?: Item;
    readonly resultItem: Item;
    readonly stock: number;
    readonly displayStock: number;
    readonly resultText: string;
    readonly costText: string;
    readonly loreText: string;
    readonly shulkerItems: readonly ShulkerItem[] | undefined;
    readonly resultName: string;
    readonly resultAmount: number;
    readonly costName: string;
}

export interface FilterResult {
    readonly trade: Trade;
    readonly matchResult: boolean;
    readonly matchCost: boolean;
    readonly displayName: string;
    readonly displayAmount: number;
}

// ============================================================================
// Sort Types
// ============================================================================

export type SortColumn = 
    | 'result-amt' 
    | 'result-name' 
    | 'cost-amt' 
    | 'cost-name' 
    | 'stock' 
    | 'dev'
    | 'world'
    | 'distance';

export type SortDirection = 'asc' | 'desc';

export interface Coordinates {
    x: number;
    y: number;
    z: number;
}

// ============================================================================
// Shopping Cart Types
// ============================================================================

export interface CartItem {
    trade: Trade;
    quantity: number;
}

/** Schema for validating CartItem from localStorage */
const ItemSchema = z.object({
    type: z.string(),
    name: z.string(),
    amount: z.number()
}).loose();

const CartItemSchema = z.object({
    trade: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
        world: z.string(),
        item1: ItemSchema,
        resultItem: ItemSchema,
        stock: z.number(),
        resultName: z.string(),
        costName: z.string()
    }).loose(),
    quantity: z.number().int().nonnegative()
});

export const CartItemArraySchema = z.array(CartItemSchema);

export interface RouteStop {
    type: 'shop' | 'portal';
    x: number;
    y: number;
    z: number;
    world: string;
    /** Overworld-equivalent X coordinate for unified map display (nether coords ×8) */
    displayX: number;
    /** Overworld-equivalent Z coordinate for unified map display (nether coords ×8) */
    displayZ: number;
    /** Whether this stop is in the nether (for visual styling) */
    isNether: boolean;
    cartItem?: CartItem;  // Only for shop stops
    portalAction?: 'enter' | 'exit';  // Only for portal stops
}

export interface ShoppingList {
    costs: Map<string, number>;   // itemName -> totalAmount
    gains: Map<string, number>;   // itemName -> totalAmount
}

// ============================================================================
// Navigation Types
// ============================================================================

export interface NavigationProgress {
    completedKeys: Set<string>;  // trade keys that are marked complete
    currentIndex: number;        // index of current stop in route
}

export type NavigationMode = 'follow' | 'manual';

/** Controls whether the navigation map view auto-switches with player world transitions */
export type ViewWorldMode = 'auto' | 'manual';

// ============================================================================
// Item Value Calculation Types
// ============================================================================

export interface PriceEntry {
    readonly price: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface ItemValueEntry {
    readonly name: string;
    readonly buyPrices: PriceEntry[];
    readonly sellPrices: PriceEntry[];
}

export type ItemValues = ReadonlyMap<string, ItemValueEntry>;

export type RatioGraph = ReadonlyMap<string, number>;

/** NxN exchange rate matrix for core currencies */
export interface ExchangeMatrix {
    /** Currency names in display order */
    readonly labels: readonly string[];
    /** ratios[row][col] = how many of labels[col] for 1 of labels[row], or undefined */
    readonly ratios: readonly (readonly (number | undefined)[])[];
}

// ============================================================================
// Dynmap Types
// ============================================================================

// ============================================================================
// Utility Types
// ============================================================================

export interface NormalizeResult {
    readonly matches: boolean;
    readonly amount: number;
}

export interface TrustedValueOptions {
    minShops?: number;
}

// ============================================================================
// Trade Input (for calculations)
// ============================================================================

export interface TradeInput {
    readonly resultName: string;
    readonly resultAmount: number;
    readonly costName: string;
    readonly costAmount: number;
    readonly item1Name: string;
    readonly item2?: Item;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

// ============================================================================
// Favorites Types
// ============================================================================

/**
 * A favorited item the user wants to watch for deals.
 * Items are identified by normalized (lowercase) result item name.
 */
export interface FavoriteItem {
    /** Normalized item name (lowercase) */
    readonly itemName: string;
    /** Optional: only highlight if deviation ≤ this value (e.g., -20 means 20% below market) */
    readonly maxDeviation?: number;
    /** Timestamp when added (for sort order) */
    readonly addedAt: number;
}

const FavoriteItemSchema = z.object({
    itemName: z.string().min(1),
    maxDeviation: z.number().int().min(-99).max(999).optional(),
    addedAt: z.number().int().positive()
});

export const FavoriteItemArraySchema = z.array(FavoriteItemSchema);

// ============================================================================
// Snapshot Types (Daily Deals Dashboard)
// ============================================================================

/**
 * A snapshot of a single trade's state at a point in time.
 * Used to detect price changes and new trades between sessions.
 */
export interface TradeSnapshotEntry {
    /** Deviation percentage from median market price (undefined if not calculable) */
    deviationPercent?: number;
    /** Stock level at snapshot time */
    stock: number;
}

/**
 * Result of a deviation calculation.
 * Moved to types.ts to break circular dependency between stores and search.
 */
export interface DeviationResult {
    /** The ratio of actual price to expected price (>1 = paying more) */
    readonly ratio: number;
    /** Percentage deviation, clamped to [-99, 999] for display */
    readonly percent: number;
    /** Display text like "+10%" or "−5%" */
    readonly text: string;
    /** True if good deal (negative deviation), false if bad, undefined if neutral */
    readonly isGood: boolean | undefined;
}

const TradeSnapshotEntrySchema = z.object({
    deviationPercent: z.number().optional(),
    stock: z.number().int().nonnegative()
});

/**
 * Full snapshot of all trade state, persisted between sessions.
 */
export interface TradeSnapshot {
    /** When this snapshot was saved (Date.now()) */
    timestamp: number;
    /** Trade states keyed by getTradeKey() */
    trades: Record<string, TradeSnapshotEntry>;
}

export const TradeSnapshotSchema = z.object({
    timestamp: z.number().positive(),
    trades: z.record(z.string(), TradeSnapshotEntrySchema)
});

/**
 * Zod schema for v2 history format (used for migration only).
 * The SnapshotHistory interface was removed — only the schema is needed.
 */
export const SnapshotHistorySchema = z.object({
    snapshots: z.array(TradeSnapshotSchema)
});

// ============================================================================
// Compact Snapshot Storage (localStorage-optimized)
// ============================================================================

/**
 * A single snapshot in compact storage form.
 * Values array is parallel to the shared keys array.
 */
export interface CompactSnapshot {
    /** Timestamp (ms since epoch) */
    t: number;
    /** Values parallel to keys: [deviationPercent | null, stock] */
    v: [number | null, number][];
}

/**
 * Compact localStorage format: keys stored once, snapshots as parallel arrays.
 * Reduces storage from ~280 KB/snapshot to ~27 KB/snapshot for ~3400 trades.
 */
export interface CompactSnapshotHistory {
    /** Trade keys, stored once (shared across all snapshots) */
    keys: string[];
    /** Compact snapshots with values parallel to keys */
    snapshots: CompactSnapshot[];
}

const CompactSnapshotSchema = z.object({
    t: z.number().positive(),
    v: z.array(z.tuple([z.number().nullable(), z.number().int().nonnegative()]))
});

export const CompactSnapshotHistorySchema = z.object({
    keys: z.array(z.string()),
    snapshots: z.array(CompactSnapshotSchema)
});

/**
 * A price drop detected between two snapshots.
 */
export interface PriceDrop {
    /** Trade key for lookup */
    tradeKey: string;
    /** Display name of the result item */
    itemName: string;
    /** Previous deviation percentage */
    oldDeviation: number;
    /** Current deviation percentage */
    newDeviation: number;
}

/**
 * A watchlist item that currently has a deal.
 */
export interface WatchlistHit {
    /** Normalized item name */
    itemName: string;
    /** Current best deviation for this item */
    currentDeviation: number;
    /** Previous deviation for this item (undefined if new) */
    previousDeviation: number | undefined;
}

/**
 * Computed dashboard data from comparing snapshots.
 */
export interface DashboardData {
    /** Trade keys that are new since last visit */
    readonly newTradeKeys: readonly string[];
    /** Trades where deviation improved by ≥5 percentage points */
    readonly priceDrops: readonly PriceDrop[];
    /** Watchlist items with active deals */
    readonly watchlistHits: readonly WatchlistHit[];
    /** Timestamp of previous snapshot (for "14h ago" display) */
    readonly lastVisit: number | undefined;
}

// ============================================================================
// Player Types
// ============================================================================

export interface PlayerPosition {
    x: number;
    y: number;
    z: number;
}

export interface PlayerRotation {
    pitch: number;  // Vertical look angle (-90 to 90)
    yaw: number;    // Horizontal heading (0=south, 90=west, 180=north, 270=east in Minecraft)
    roll: number;   // Usually 0
}

export interface Player {
    uuid: string;
    name: string;
    /** Whether the player is in a "foreign" dimension (nether). true = nether, false = overworld */
    foreign: boolean;
    position: PlayerPosition;
    rotation?: PlayerRotation;  // Player's look direction
    /** Optional world name from dynmap. If absent, use `foreign` flag to determine dimension */
    world?: string;
}

export interface PlayersData {
    players: Player[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: AppConfig = {
    dataUrl: 'https://web.peacefulvanilla.club/shops/data.json',
    dataRefreshMs: 60_000,
    tileSource: 'dynmap',
    tilePyramid: {
        tileWidth: 256,
        tileHeight: 256,
        levels: 3,
        scaleFactor: 4,
        baseBlocksPerTile: 256,
        format: 'png'
    },
    dynmap: {
        baseUrl: 'https://web.peacefulvanilla.club/maps',
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
};
