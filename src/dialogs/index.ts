/**
 * Dialog Modules
 * 
 * Re-exports all dialog-related functionality.
 * 
 * @module dialogs
 */

export { renderMatrix } from './matrix-dialog.js';

// Shop map helpers
export {
    createEdgeMarker,
    getWorldDisplayName
} from './shop-map-helpers.js';
export type { EdgeMarkerParameters } from './shop-map-helpers.js';
