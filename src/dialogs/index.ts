/**
 * Dialog Modules
 * 
 * Re-exports all dialog-related functionality.
 * 
 * @module dialogs
 */

// Dialog utilities
export {
    openDialog,
    setupDialogBackdropClose} from './dialog-utilities.js';

// Price table dialog
export { renderExchangeMatrix } from './matrix-dialog.js';

// Trade details dialog
export type { TradeDetailsOptions } from './trade-details.js';
export { createTradeDetailsHandler } from './trade-details.js';

// Shop map helpers
export type { EdgeMarkerParameters, LabelLayout, LabelPosition, LabelRect } from './shop-map-helpers.js';
export {
    createEdgeMarker,
    getWorldDisplayName,
    resolvePlayerLabelPositions} from './shop-map-helpers.js';
