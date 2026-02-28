/**
 * Global Test API Type Declarations
 * 
 * Declares the shape of globals exposed for E2E testing.
 * These globals are only defined at runtime, not in production.
 * 
 * @module test-globals
 */

import type { CartStore } from './stores/cart-store.js';
import type { FavoritesStore } from './stores/favorites-store.js';
import type { RouteStop } from './types.js';

/** Leaflet map instance (nav map) */
type NavMap = L.Map | undefined;

/**
 * Test API globals exposed on globalThis for E2E testing.
 * These globals are only defined at runtime, not in production.
 */
declare global {
    var __navCurrentRoute: readonly RouteStop[];
    var __navCurrentWorldRoute: readonly RouteStop[];
    var __navMap: NavMap;
    var __navMapWorld: string;
    var __navMapCenterTileX: number;
    var __navMapCenterTileZ: number;
    var __leafletMap: L.Map | undefined;
    var __cartStore: CartStore;
    var __favoritesStore: FavoritesStore;
    
    /** Triggers a shop data refresh and returns count of new trades */
    var refreshShopData: () => Promise<number>;
}

// Export the NavMap type for potential external use
export type { NavMap };
