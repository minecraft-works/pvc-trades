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
    updateClearButtonVisibility,
} from './search-sort.js';
