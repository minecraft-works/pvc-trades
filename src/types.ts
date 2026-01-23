/**
 * Type definitions for the Shop Trade Viewer application
 */

import { z } from 'zod';

// ============================================================================
// Configuration Types
// ============================================================================

export const DynmapConfigSchema = z.object({
    baseUrl: z.string().url(),
    tileSize: z.number().int().positive(),
    defaultZoom: z.number().int().min(0).max(10),
    maxZoomLevel: z.number().int().positive(),
    playerRefreshMs: z.number().int().positive()
});

export const AnalysisConfigSchema = z.object({
    shopClusterDistance: z.number().positive(),
    maxTransitiveIterations: z.number().int().positive(),
    minIndependentShops: z.number().int().positive()
});

export const AppConfigSchema = z.object({
    dataUrl: z.string().min(1),
    dynmap: DynmapConfigSchema,
    analysis: AnalysisConfigSchema
});

export type DynmapConfig = z.infer<typeof DynmapConfigSchema>;
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

// ============================================================================
// Block Conversions
// ============================================================================

export const BlockConversionSchema = z.object({
    base: z.string(),
    multiplier: z.number().positive()
});

export const BlockConversionsSchema = z.record(z.string(), BlockConversionSchema);

export type BlockConversion = z.infer<typeof BlockConversionSchema>;
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

export const MappingRulesSchema = z.array(MappingRuleSchema);

export type MappingRule = z.infer<typeof MappingRuleSchema>;
export type MappingRules = z.infer<typeof MappingRulesSchema>;

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
    shulkerItems: ShulkerItem[] | null;
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

export interface SortState {
    column: SortColumn | null;
    direction: SortDirection | null;
}

// Multi-column sort: Map from column to direction
export type MultiSortState = Map<SortColumn, SortDirection>;

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
    z: number;
    world: string;
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

export type RouteStopStatus = 'completed' | 'current' | 'pending';

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
// Deviation Types
// ============================================================================

export interface Deviation {
    ratio: number;
    text: string;
    isGood: boolean | null;
}

// ============================================================================
// Dynmap Types
// ============================================================================

export interface DynmapPlayer {
    name: string;
    world: string;
    x: number;
    y?: number;
    z: number;
}

export interface DynmapPlayersResponse {
    players: DynmapPlayer[];
}

export interface MapState {
    worldId: string;
    blocksPerTile: number;
    centerTileX: number;
    centerTileZ: number;
    shopX: number;
    shopZ: number;
}

export interface PixelPosition {
    pixelX: number;
    pixelZ: number;
}

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

export interface Player {
    uuid: string;
    name: string;
    foreign: boolean;
    position: PlayerPosition;
    world?: string;  // Optional - if provided, indicates which dimension the player is in
}

export interface PlayersData {
    players: Player[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: AppConfig = {
    dataUrl: 'https://web.peacefulvanilla.club/shops/data.json',
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
