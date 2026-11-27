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

const SquaremapConfigSchema = z.object({
    /** Map server base URL; tiles live at `{baseUrl}/tiles/...` */
    baseUrl: z.url(),
    playerRefreshMs: z.number().int().positive()
});

const AnalysisConfigSchema = z.object({
    shopClusterDistance: z.number().positive(),
    maxTransitiveIterations: z.number().int().positive(),
    minIndependentShops: z.number().int().positive(),
    /** Independent shops needed before a non-core item gets a market price (default 2) */
    minIndependentShopsPerItem: z.number().int().positive().optional()
});

export const AppConfigSchema = z.object({
    dataUrl: z.string().min(1),
    dataRefreshMs: z.number().int().positive().optional().default(60_000),
    squaremap: SquaremapConfigSchema,
    analysis: AnalysisConfigSchema
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

const BlockConversionSchema = z.object({
    base: z.string(),
    multiplier: z.number().positive()
});

export const BlockConversionsSchema = z.record(z.string(), BlockConversionSchema);

export type BlockConversions = z.infer<typeof BlockConversionsSchema>;

// Trade Mapping Rules

export const MappingRuleSchema = z.object({
    item: z.string(),
    originalName: z.string().optional(),
    enchant: z.record(z.string(), z.number()).optional(),
    customName: z.string(),
    lore: z.string().optional()
});

export type MappingRule = z.infer<typeof MappingRuleSchema>;

// Item Types

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

// Shop & Recipe Types

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
    shopName: z.string().optional(),
    shopOwner: z.string().optional(),
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
    /** Name tag of the shopkeeper, e.g. "End Item Vendor" */
    shopName?: string | undefined;
    /** Player who owns the shop */
    shopOwner?: string | undefined;
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
    /** Name the seller gave a filled shulker box, e.g. "mending" on a box of books */
    readonly resultLabel?: string | undefined;
    readonly costName: string;
    /** Name tag of the shopkeeper, if it has one */
    readonly shopName?: string | undefined;
    /** Player who owns the shop, if known */
    readonly shopOwner?: string | undefined;
}

export interface FilterResult {
    readonly trade: Trade;
    readonly matchResult: boolean;
    readonly matchCost: boolean;
    readonly displayName: string;
    readonly displayAmount: number;
}

/** Quick-bar toggles applied on top of the text search */
export interface QuickFilters {
    /** Only trades at least 20% below market */
    readonly dealsOnly: boolean;
    /** Only the cheapest offer for each item */
    readonly bestPerItem: boolean;
    /** Only trades that buy or sell a filled shulker box */
    readonly shulkersOnly: boolean;
}

/** Limits the results to one player's shops, or to one of their shops */
export interface ShopFilter {
    /** Shop owner (case-insensitive) */
    readonly owner: string;
    /** Shop name; all of the owner's shops when absent */
    readonly shop?: string | undefined;
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
    /** Shop owner; prices from one owner count as a single independent source */
    readonly owner?: string | undefined;
}

export interface ItemValueEntry {
    readonly name: string;
    readonly buyPrices: PriceEntry[];
    readonly sellPrices: PriceEntry[];
}

export type ItemValues = ReadonlyMap<string, ItemValueEntry>;

/**
 * Per-unit prices keyed by (result, cost) pair, e.g. "hanging roots|diamond".
 * Lets a trade be compared with others paid in the same currency.
 */
export type PairPrices = ReadonlyMap<string, readonly PriceEntry[]>;

export type RatioGraph = ReadonlyMap<string, number>;

/** NxN exchange rate matrix for core currencies */
export interface ExchangeMatrix {
    /** Currency names in display order */
    readonly labels: readonly string[];
    /** ratios[row][col] = how many of labels[col] for 1 of labels[row], or undefined */
    readonly ratios: readonly (readonly (number | undefined)[])[];
}

// ============================================================================
// Utility Types
// ============================================================================

export interface NormalizeResult {
    readonly matches: boolean;
    readonly amount: number;
}

export interface TrustedValueOptions {
    /** Independent shops required for core blocks (default 3) */
    minShops?: number;
    /** Independent shops required for all other items (default from config, else 2) */
    minItemShops?: number;
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
    /** Shop owner, if known */
    readonly owner?: string | undefined;
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
// Snapshot & Dashboard Types (extracted to snapshot-types.ts)
// ============================================================================

export type {
    CompactSnapshotHistory,
    DashboardData,
    DeviationResult,
    PriceDrop,
    TradeSnapshot,
    TradeSnapshotEntry,
    WatchlistHit,
} from './snapshot-types.js';
export {
    CompactSnapshotHistorySchema,
    SnapshotHistorySchema,
    TradeSnapshotSchema,
} from './snapshot-types.js';

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

/**
 * Player's look direction.
 * pitch: vertical (-90 to 90), yaw: horizontal heading, roll: usually 0
 */
export type Player = z.infer<typeof PlayerSchema>;

// ============================================================================
// Default Configuration
// ============================================================================

/** Fallback configuration when config.json cannot be loaded or parsed */
export const DEFAULT_CONFIG: AppConfig = {
    dataUrl: 'https://web.peacefulvanilla.club/shops/data.json',
    dataRefreshMs: 60_000,
    squaremap: {
        baseUrl: 'https://web.peacefulvanilla.club/maps',
        playerRefreshMs: 1000
    },
    analysis: {
        shopClusterDistance: 16,
        maxTransitiveIterations: 10,
        minIndependentShops: 3
    }
};

