/**
 * Global Test API Type Declarations
 * 
 * Declares the shape of globals exposed for E2E testing.
 * These globals are only defined at runtime, not in production.
 * 
 * @module test-globals
 */

import type { RouteStop } from './types.js';

/** Leaflet map instance (nav map) */
type NavMap = L.Map | undefined;

/**
 * Test API globals exposed on globalThis for E2E testing.
 * These are defined in main.ts when running tests.
 */
declare global {
    var __navCurrentRoute: RouteStop[];
    var __navCurrentWorldRoute: RouteStop[];
    var __navMap: NavMap;
    var __navMapWorld: string;
    var __navMapCenterTileX: number;
    var __navMapCenterTileZ: number;
}

// Export the NavMap type for potential external use
export type { NavMap };
