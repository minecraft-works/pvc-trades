/**
 * Dialog Modules
 * 
 * Re-exports all dialog-related functionality.
 * 
 * @module dialogs
 */

// Dialog utilities
export {
    setupDialogBackdropClose,
    openDialog
} from './dialog-utilities.js';

// Price table dialog
export { renderExchangeMatrix } from './matrix-dialog.js';

// Trade details dialog
export { createTradeDetailsHandler } from './trade-details.js';
export type { TradeDetailsOptions } from './trade-details.js';

// Shop map helpers
export {
    createEdgeMarker,
    getWorldDisplayName
} from './shop-map-helpers.js';
export type { EdgeMarkerParameters } from './shop-map-helpers.js';
