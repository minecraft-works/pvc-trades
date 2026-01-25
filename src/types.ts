/**
 * Type definitions for the Shop Trade Viewer application
 */

import { z } from 'zod';

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

const AnalysisConfigSchema = z.object({
    shopClusterDistance: z.number().positive(),
    maxTransitiveIterations: z.number().int().positive(),
    minIndependentShops: z.number().int().positive()
});

export const AppConfigSchema = z.object({
    dataUrl: z.string().min(1),
    dataRefreshMs: z.number().int().positive().optional().default(60_000),
    dynmap: DynmapConfigSchema,
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
    type: string;
    name: string;
    amount: number;
    enchant?: Record<string, number>;
    lore?: string[];
}

export interface ShulkerItem {
    key: string;
    name: string;
    total: number;
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
    x: number;
    y: number;
    z: number;
    world: string;
    item1: Item;
    item2?: Item;
    resultItem: Item;
    stock: number;
    displayStock: number;
    resultText: string;
    costText: string;
    loreText: string;
    shulkerItems: ShulkerItem[] | undefined;
    resultName: string;
    resultAmount: number;
    costName: string;
}

export interface FilterResult {
    trade: Trade;
    matchResult: boolean;
    matchCost: boolean;
    displayName: string;
    displayAmount: number;
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

export const NAV_STORAGE_KEY = 'pvc-trades-nav-progress';
export const NAV_PLAYER_KEY = 'pvc-trades-nav-player';
export const NAV_TAB_KEY = 'pvc-trades-nav-tab';
export const NAV_MODE_KEY = 'pvc-trades-nav-mode';

// ============================================================================
// Item Value Calculation Types
// ============================================================================

export interface PriceEntry {
    price: number;
    x: number;
    y: number;
    z: number;
}

export interface ItemValueEntry {
    name: string;
    buyPrices: PriceEntry[];
    sellPrices: PriceEntry[];
}

export type ItemValues = Map<string, ItemValueEntry>;

export type RatioGraph = Map<string, number>;

// ============================================================================
// Dynmap Types
// ============================================================================

// ============================================================================
// Utility Types
// ============================================================================

export interface NormalizeResult {
    matches: boolean;
    amount: number;
}

export interface TrustedValueOptions {
    minShops?: number;
}

// ============================================================================
// Trade Input (for calculations)
// ============================================================================

export interface TradeInput {
    resultName: string;
    resultAmount: number;
    costName: string;
    costAmount: number;
    item2?: Item;
    x: number;
    y: number;
    z: number;
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
