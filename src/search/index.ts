/**
 * Search and filtering utilities
 * @module search
 */

export { createDeviationCalculator, type DeviationResult } from './deviation.js';
export type {
    SearchSortDeps,
    SearchSortHandler,
} from './search-sort.js';
export {
    createSearchSortHandler,
    getTotalCostAmount,
    updateClearButtonVisibility,
} from './search-sort.js';
