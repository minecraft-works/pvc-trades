/**
 * Application-wide constants
 * 
 * Centralizes magic numbers, CSS classes, selectors, and configuration values
 * to make them easier to find, update, and document.
 * 
 * @module constants
 */

import type { SortDirection } from './types.js';

// ============================================================================
// Navigation Constants
// ============================================================================

/** Navigation-related thresholds and timing */
export const NAVIGATION = {
    /** Distance in blocks to auto-complete a shop stop */
    ARRIVAL_THRESHOLD: 8,
    /** Distance in blocks to show nearby shop tooltip */
    NEARBY_THRESHOLD: 100,
    /** Distance in blocks to trigger route recalculation */
    RECALCULATION_THRESHOLD: 10,
} as const;

// ============================================================================
// Deviation Constants
// ============================================================================

/** Price deviation display limits */
export const DEVIATION = {
    MIN_PERCENT: -99,
    MAX_PERCENT: 999,
} as const;

// ============================================================================
// Sort Constants
// ============================================================================

/** Sort direction values */
export const SORT = {
    ASC: 'asc' as SortDirection,
    DESC: 'desc' as SortDirection,
} as const;

// ============================================================================
// Storage Keys
// ============================================================================

/** localStorage keys for persistence */
export const STORAGE_KEYS = {
    CART: 'pvc-trades-cart',
    FAVORITES: 'pvc-trades-favorites',
    NAV_PROGRESS: 'pvc-trades-nav-progress',
    NAV_PLAYER: 'pvc-trades-nav-player',
    NAV_TAB: 'pvc-trades-nav-tab',
    NAV_MODE: 'pvc-trades-nav-mode',
    NAV_VIEW_WORLD: 'pvc-trades-nav-view-world',
    NAV_VIEW_WORLD_MODE: 'pvc-trades-nav-view-world-mode',
} as const;

// ============================================================================
// CSS Classes
// ============================================================================

/** CSS class names used in JavaScript */
export const CSS_CLASSES = {
    CART_EMPTY: 'cart-empty',
    TRADE_ROW: 'trade-row',
} as const;

// ============================================================================
// DOM Selectors
// ============================================================================

/** CSS selectors for querying DOM elements */
export const SELECTORS = {
    MAP_DIALOG: '#map-dialog',
    NAV_DIALOG: '#nav-dialog',
    PLAYER_NAME_INPUT: '#player-name-input',
    CLOSE_MATRIX: '#close-matrix',
    RECENTER_MAP: '#recenter-map',
    NAV_VIEW_MODE_TOGGLE: '#nav-view-mode-toggle',
    NAV_WORLD_TOGGLE: '#nav-world-toggle',
    FAVORITE_POPOVER: '#favorite-popover',
} as const;

// ============================================================================
// Dialog IDs
// ============================================================================

/** Dialog element IDs (without #) */
export const DIALOG_IDS = {
    CART: 'cart-dialog',
    MATRIX: 'matrix-dialog',
} as const;

// ============================================================================
// World Identifiers
// ============================================================================

/** Minecraft world/dimension identifiers */
export const WORLDS = {
    OVERWORLD: 'overworld',
    NETHER: 'the_nether',
    END: 'the_end',
    /** Nether coordinate ratio (nether * 8 = overworld) */
    NETHER_RATIO: 8,
} as const;

// ============================================================================
// Column Identifiers
// ============================================================================

/** Sort column identifiers */
export const COLUMNS = {
    COST_NAME: 'cost-name',
    RESULT_NAME: 'result-name',
    COST_AMT: 'cost-amt',
    RESULT_AMT: 'result-amt',
} as const;
