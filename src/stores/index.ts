/**
 * Store exports
 * 
 * Centralized re-exports for all application stores.
 * 
 * @module stores
 */

export { cartStore } from './cart-store.js';
export { navigationStore } from './navigation-store.js';
export type { PlayerPosition } from './navigation-store.js';
export { favoritesStore } from './favorites-store.js';
export { snapshotStore } from './snapshot-store.js';

// Player interpolation
export {
    PlayerInterpolator,
    getInterpolator,
    removeInterpolator,
    clearAllInterpolators,
    getAllInterpolators
} from './player-interpolator.js';
export type { PositionSample } from './player-interpolator.js';

// Configuration stores
export { configStore, getConfig, loadConfig } from './config-store.js';
export { coreBlocksStore, getCoreBlocks, loadBaseItems } from './core-blocks-store.js';
export { blockConversionsStore, loadFixedRatios } from './block-conversions-store.js';
