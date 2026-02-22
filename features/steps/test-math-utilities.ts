/**
 * Shared test utilities for navigation and coordinate calculations
 * 
 * Re-exports production functions from library.ts to ensure test logic
 * matches production logic, plus adds test-only utilities.
 * 
 * @module test-math-utilities
 */

// Re-export from library.ts - use these instead of duplicating
export { calculateRouteDistance, isNether,toOverworldEquivalent } from '../../src/library.js';

// Re-export constants
export { NAVIGATION, WORLDS } from '../../src/constants.js';

// Convenience alias for calculateRouteDistance
export { calculateRouteDistance as calculateDistance } from '../../src/library.js';

/** Nether coordinate ratio (re-exported for convenience) */
export const NETHER_RATIO = 8;

// ============================================================================
// Test-only utilities (not needed in production code)
// ============================================================================

/**
 * Convert overworld coordinates to nether equivalent (floor division)
 * Inverse of toOverworldEquivalent for nether
 * 
 * @example
 * overworldToNether(800, 800) // { x: 100, z: 100 }
 */
export function overworldToNether(x: number, z: number): { x: number; z: number } {
    return { x: Math.floor(x / NETHER_RATIO), z: Math.floor(z / NETHER_RATIO) };
}

/**
 * Convert nether coordinates to overworld equivalent
 * 
 * @example
 * netherToOverworld(100, 100) // { x: 800, z: 800 }
 */
export function netherToOverworld(x: number, z: number): { x: number; z: number } {
    return { x: x * NETHER_RATIO, z: z * NETHER_RATIO };
}

/**
 * Simple 2D distance between two points (same world)
 * For cross-world distance, use calculateDistance instead.
 */
export function simpleDistance(x1: number, z1: number, x2: number, z2: number): number {
    return Math.hypot(x1 - x2, z1 - z2);
}

/**
 * Convert Minecraft yaw to compass direction
 * Minecraft yaw: 0=south, 90=west, 180=north, -90=east
 */
export function yawToDirection(yaw: number): string {
    // Normalize yaw to 0-360 range
    const normalized = ((yaw % 360) + 360) % 360;
    
    // Map to 8 compass directions (each 45 degrees)
    // 0=south, 45=southwest, 90=west, 135=northwest, 180=north, 225=northeast, 270=east, 315=southeast
    if (normalized >= 337.5 || normalized < 22.5) { return 'south'; }
    if (normalized >= 22.5 && normalized < 67.5) { return 'southwest'; }
    if (normalized >= 67.5 && normalized < 112.5) { return 'west'; }
    if (normalized >= 112.5 && normalized < 157.5) { return 'northwest'; }
    if (normalized >= 157.5 && normalized < 202.5) { return 'north'; }
    if (normalized >= 202.5 && normalized < 247.5) { return 'northeast'; }
    if (normalized >= 247.5 && normalized < 292.5) { return 'east'; }
    return 'southeast';
}

/**
 * Get compass direction from position delta (origin to target)
 */
export function getDirectionFromDelta(x: number, z: number): string {
    // Handle cardinal directions first
    if (x > 0 && z === 0) { return 'east'; }
    if (x < 0 && z === 0) { return 'west'; }
    if (x === 0 && z > 0) { return 'south'; }
    if (x === 0 && z < 0) { return 'north'; }
    
    // Handle diagonal directions
    if (x > 0 && z > 0) { return 'southeast'; }
    if (x > 0 && z < 0) { return 'northeast'; }
    if (x < 0 && z > 0) { return 'southwest'; }
    if (x < 0 && z < 0) { return 'northwest'; }
    
    return 'none';
}

/**
 * Check if player is within range of shop
 */
export function isWithinRange(
    playerX: number, playerZ: number, 
    shopX: number, shopZ: number, 
    threshold: number
): boolean {
    return simpleDistance(playerX, playerZ, shopX, shopZ) < threshold;
}

/**
 * Check if auto-advance should trigger based on distance
 * Player is "arrived" when strictly inside the threshold radius
 */
export function shouldAutoAdvance(distance: number, threshold: number): boolean {
    return distance < threshold;
}
