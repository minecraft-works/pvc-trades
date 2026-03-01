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
    format: z.enum(['png', 'webp', 'avif', 'jpeg']).default('png'),
    /** Heightmap-based lighting configuration (BlueMap sources only) */
    lighting: z.object({
        /** Enable baked lighting at build time */
        enabled: z.boolean().default(true),
        /** Shading model: 'slope' (BlueMap-style) or 'lambertian' (normal-based) */
        model: z.enum(['slope', 'lambertian']).default('lambertian'),
        /** Sun direction vector [x, y, z] — normalized internally */
        sunDirection: z.tuple([z.number(), z.number(), z.number()]).default([0.3, 1, -0.3]),
        /** Ambient light intensity (0–1). Prevents pure-black shadows */
        ambientIntensity: z.number().min(0).max(1).default(0.35),
        /** Diffuse light intensity (0–1) */
        diffuseIntensity: z.number().min(0).max(1).default(0.65),
        /** Height exaggeration factor (1.0 = real height) */
        heightScale: z.number().positive().default(1),
        /**
         * Y component of the surface normal for Lambertian shading.
         * Higher = flatter terrain appearance (subtler per-block shading).
         * Default 2 = BlueMap-like (steep). Use ~20 for Minecraft pixel-art terrain.
         */
        normalScale: z.number().positive().default(2),
        /**
         * Additive brightness boost from BlueMap block-light channel (0–1).
         * 0 = disabled. 0.2 = subtle warm glow from torches/lava.
         */
        blockLightBoost: z.number().min(0).max(1).default(0),
        /**
         * Integer upscale factor applied before shading (1–4).
         * Heights and block-light values are bilinearly upsampled; colors are
         * upsampled with nearest-neighbour. Shade is computed and the tile emitted
         * at `shadingScale × tileSize`. Set tileWidth/Height to match in the preset.
         */
        shadingScale: z.number().int().min(1).max(4).default(1),
        /** Shadow casting via heightmap ray marching */
        shadowCasting: z.object({
            enabled: z.boolean().default(false),
            /** Maximum ray march distance in pixels */
            maxDistance: z.number().int().positive().default(64),
            /** Shadow darkness (0 = no shadow, 1 = full black) */
            intensity: z.number().min(0).max(1).default(0.7),
        }).default({ enabled: false, maxDistance: 64, intensity: 0.7 }),
        /** Screen-space ambient occlusion from heightmap */
        ambientOcclusion: z.object({
            enabled: z.boolean().default(false),
            /** Number of radial samples per pixel */
            samples: z.number().int().min(4).max(64).default(16),
            /** Sampling radius in pixels */
            radius: z.number().int().positive().default(8),
            /** AO darkness multiplier (0 = none, 1 = full) */
            intensity: z.number().min(0).max(1).default(0.5),
        }).default({ enabled: false, samples: 16, radius: 8, intensity: 0.5 }),
        /** Post-processing unsharp mask for detail enhancement */
        unsharpMask: z.object({
            enabled: z.boolean().default(false),
            /** Gaussian blur radius in pixels */
            radius: z.number().int().positive().default(2),
            /** Sharpening amount multiplier */
            amount: z.number().min(0).max(5).default(0.5),
            /** Luminance difference threshold (skip subtle changes) */
            threshold: z.number().min(0).default(4),
        }).default({ enabled: false, radius: 2, amount: 0.5, threshold: 4 }),
        /** Hue-based per-material shading modifiers */
        materialShading: z.object({
            enabled: z.boolean().default(false),
            /** Additive specular highlight for water surfaces */
            waterSpecular: z.number().min(0).max(1).default(0.3),
            /** Brightness boost for foliage (additive, 0–1) */
            foliageBrightness: z.number().min(0).max(1).default(0.1),
            /** AO multiplier for stone/grey surfaces */
            stoneAOMultiplier: z.number().min(0).max(5).default(1.5),
            /** Brightness boost for snow surfaces (additive, 0–1) */
            snowBrightness: z.number().min(0).max(1).default(0.2),
            /** Constant specular add for lava glow (0–1) */
            lavaGlow: z.number().min(0).max(1).default(0.25),
            /** AO multiplier for sand surfaces */
            sandAOMultiplier: z.number().min(0).max(2).default(0.4),
        }).default({ enabled: false, waterSpecular: 0.3, foliageBrightness: 0.1, stoneAOMultiplier: 1.5, snowBrightness: 0.2, lavaGlow: 0.25, sandAOMultiplier: 0.4 }),
        /** Normal kernel size: 3=central diff, 5=Sobel 5×5, 7=Sobel 7×7 */
        normalKernelSize: z.union([z.literal(3), z.literal(5), z.literal(7)]).default(3),
        /** Emit separate 8-bit grayscale heightmap tiles alongside color tiles */
        emitHeightmapTiles: z.boolean().default(true)
    }).optional()
});

export type TilePyramidConfig = z.infer<typeof TilePyramidConfigSchema>;

/**
 * Partial pyramid overrides stored per-source in `tileSourcePresets`.
 * Only the fields you want to override need to be specified.
 */
const TilePyramidPresetSchema = TilePyramidConfigSchema.partial();

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
    /**
     * Per-source pyramid presets. When `tileSource` is set, the matching
     * preset is merged under `tilePyramid` before Zod validation — explicit
     * top-level `tilePyramid` fields always take precedence.
     *
     * Switching source (e.g. `"dynmap"` → `"bluemap"`) automatically applies
     * the right tile dimensions without any other changes.
     */
    tileSourcePresets: z.object({
        dynmap: TilePyramidPresetSchema.optional(),
        bluemap: TilePyramidPresetSchema.optional()
    }).optional(),
    tilePyramid: TilePyramidConfigSchema.default({
        tileWidth: 256,
        tileHeight: 256,
        levels: 3,
        scaleFactor: 4,
        baseBlocksPerTile: 256,
        format: 'png' as const,
        lighting: {
            enabled: true,
            model: 'lambertian' as const,
            sunDirection: [0.3, 1, -0.3] as [number, number, number],
            ambientIntensity: 0.35,
            diffuseIntensity: 0.65,
            heightScale: 1,
            normalScale: 2,
            blockLightBoost: 0,
            shadingScale: 1,
            shadowCasting: { enabled: false, maxDistance: 64, intensity: 0.7 },
            ambientOcclusion: { enabled: false, samples: 16, radius: 8, intensity: 0.5 },
            unsharpMask: { enabled: false, radius: 2, amount: 0.5, threshold: 4 },
            materialShading: { enabled: false, waterSpecular: 0.3, foliageBrightness: 0.1, stoneAOMultiplier: 1.5, snowBrightness: 0.2, lavaGlow: 0.25, sandAOMultiplier: 0.4 },
            normalKernelSize: 3 as const,
            emitHeightmapTiles: true
        }
    }),
    dynmap: DynmapConfigSchema,
    bluemap: BlueMapConfigSchema.optional(),
    analysis: AnalysisConfigSchema
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ============================================================================
// Config Preset Resolution
// ============================================================================

/**
 * Merge `tileSourcePresets[tileSource]` into the raw config object before
 * Zod validation so that Zod defaults fill gaps correctly.
 *
 * The preset provides base values; any explicit `tilePyramid` fields in the
 * raw JSON override them. Call this on the raw parsed JSON before passing
 * to `AppConfigSchema.safeParse()`.
 *
 * @param raw - Raw parsed JSON (unknown type)
 * @returns The same object with `tilePyramid` pre-merged from the preset
 */
export function resolveRawConfig(raw: unknown): unknown {
    if (typeof raw !== 'object' || raw === null) { return raw; }
    const obj = raw as Record<string, unknown>;
    const source = typeof obj.tileSource === 'string' ? obj.tileSource : undefined;
    const presets = typeof obj.tileSourcePresets === 'object' && obj.tileSourcePresets !== null
        ? obj.tileSourcePresets as Record<string, unknown>
        : undefined;
    if (!source || !presets || typeof presets[source] !== 'object' || presets[source] === null) {
        return raw;
    }
    const preset = presets[source] as Record<string, unknown>;
    const explicit = typeof obj.tilePyramid === 'object' && obj.tilePyramid !== null
        ? obj.tilePyramid as Record<string, unknown>
        : {};
    return { ...obj, tilePyramid: { ...preset, ...explicit } };
}

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

/** Schema for validating Item from external data */
const ItemSchema = z.object({
    type: z.string(),
    name: z.string().optional().default(''),
    amount: z.number()
}).loose();

const RecipeSchema = z.object({
    resultItem: ItemSchema,
    item1: ItemSchema,
    item2: ItemSchema.optional(),
    stock: z.number()
}).loose();

const ShopSchema = z.object({
    location: z.string(),
    world: z.string(),
    recipes: z.array(RecipeSchema)
}).loose();

/** Schema for validating external shop data JSON */
export const ShopDataSchema = z.object({
    data: z.array(ShopSchema)
});

export interface Recipe {
    resultItem: Item;
    item1: Item;
    item2?: Item | undefined;
    stock: number;
}

export interface Shop {
    location: string;
    world: string;
    recipes: Recipe[];
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
    readonly item2?: Item | undefined;
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
    readonly item2?: Item | undefined;
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
    readonly maxDeviation?: number | undefined;
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
    deviationPercent?: number | undefined;
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

const PlayerPositionSchema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number()
});

const PlayerRotationSchema = z.object({
    pitch: z.number(),
    yaw: z.number(),
    roll: z.number()
});

const PlayerSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    foreign: z.boolean(),
    position: PlayerPositionSchema,
    rotation: PlayerRotationSchema.optional(),
    world: z.string().optional()
});

/** Schema for validating external player API response */
export const PlayersDataSchema = z.object({
    players: z.array(PlayerSchema)
});

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
    rotation?: PlayerRotation | undefined;  // Player's look direction
    /** Optional world name from dynmap. If absent, use `foreign` flag to determine dimension */
    world?: string | undefined;
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
        format: 'png',
        lighting: {
            enabled: true,
            model: 'lambertian',
            sunDirection: [0.3, 1, -0.3] as [number, number, number],
            ambientIntensity: 0.35,
            diffuseIntensity: 0.65,
            heightScale: 1,
            normalScale: 2,
            blockLightBoost: 0,
            shadingScale: 1,
            shadowCasting: { enabled: false, maxDistance: 64, intensity: 0.7 },
            ambientOcclusion: { enabled: false, samples: 16, radius: 8, intensity: 0.5 },
            unsharpMask: { enabled: false, radius: 2, amount: 0.5, threshold: 4 },
            materialShading: { enabled: false, waterSpecular: 0.3, foliageBrightness: 0.1, stoneAOMultiplier: 1.5, snowBrightness: 0.2, lavaGlow: 0.25, sandAOMultiplier: 0.4 },
            normalKernelSize: 3 as const,
            emitHeightmapTiles: true
        }
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
