/**
 * Matrix Dialog Module
 * 
 * Renders the conversion matrix showing exchange rates between core currencies.
 * 
 * @module dialogs/matrix-dialog
 */

import { escapeHtml, getRatio, getCoreBlocks } from '../library.js';
import { SELECTORS, DIALOG_IDS } from '../constants.js';
import type { RatioGraph } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

/** Icon URLs for core currency items */
const ITEM_ICONS: Record<string, string> = {
    'Netherite Ingot': 'icons/netherite_ingot.png',
    'Netherite Block': 'icons/netherite_block.png',
    'Diamond Block': 'icons/diamond_block.png',
    'Diamond': 'icons/diamond.png',
    'Emerald Block': 'icons/emerald_block.png',
    'Emerald': 'icons/emerald.png',
    'Gold Block': 'icons/gold_block.png',
    'Gold Ingot': 'icons/gold_ingot.png',
    'Iron Block': 'icons/iron_block.png',
    'Iron Ingot': 'icons/iron_ingot.png',
};

const MATRIX_HEADER_HTML = '<header><h2>Conversion Matrix</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the icon HTML for an item, or escaped text if no icon exists
 */
function getItemIcon(name: string): string {
    const url = ITEM_ICONS[name];
    if (url) {
        return `<img src="${url}" alt="${escapeHtml(name)}" class="matrix-icon" title="${escapeHtml(name)}">`;
    }
    return escapeHtml(name);
}

/**
 * Format a ratio value as "X:1" or "1:X"
 */
function formatMatrixValue(value: number): string {
    // Always show as ratio X:1 or 1:X
    if (value >= 1) {
        // Value >= 1: show as "X:1"
        const rounded = Math.round(value);
        return `${rounded}:1`;
    } else {
        // Value < 1: show as "1:X"
        const inverse = Math.round(1 / value);
        return `1:${inverse}`;
    }
}

/**
 * Build the matrix cell HTML for a given row/column pair
 */
function buildMatrixCell(ratioGraph: RatioGraph, row: string, col: string, colIndex: number, rowIndex: number): string {
    if (colIndex >= rowIndex) {
        // Diagonal and upper triangle - skip (redundant data)
        return '<td class="skip"></td>';
    }
    
    const ratio = getRatio(ratioGraph, row, col);
    return ratio === undefined
        ? '<td class="unknown" title="No conversion path found">?</td>'
        : `<td title="1 ${escapeHtml(row)} = ${ratio.toFixed(4)} ${escapeHtml(col)}">${formatMatrixValue(ratio)}</td>`;
}

/**
 * Build the matrix row HTML for a given row item
 */
function buildMatrixRow(ratioGraph: RatioGraph, row: string, rowIndex: number, coreBlocks: string[]): string {
    let html = `<tr><th>${getItemIcon(row)}</th>`;
    
    // Skip last column (not needed for lower triangle)
    for (let colIndex = 0; colIndex < coreBlocks.length - 1; colIndex++) {
        const col = coreBlocks[colIndex];
        html += col ? buildMatrixCell(ratioGraph, row, col, colIndex, rowIndex) : '';
    }
    
    return html + '</tr>';
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render the conversion matrix dialog
 * 
 * @param container - Container element for the matrix
 * @param ratioGraph - The computed ratio graph, or undefined if not available
 * @param getElement - Helper function to get elements by ID
 */
export function renderMatrix(
    container: HTMLElement,
    ratioGraph: RatioGraph | undefined,
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T
): void {
    if (!ratioGraph || ratioGraph.size === 0) {
        container.innerHTML = `${MATRIX_HEADER_HTML}<p class="muted">No conversion data available</p>`;
        container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
            getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
        });
        return;
    }

    const coreBlocks = getCoreBlocks();
    let html = MATRIX_HEADER_HTML;
    html += '<div class="matrix-wrapper"><table class="matrix"><thead><tr><th></th>';
    
    // Skip last column header (not needed for lower triangle)
    for (let index = 0; index < coreBlocks.length - 1; index++) {
        const block = coreBlocks[index];
        html += block ? `<th>${getItemIcon(block)}</th>` : '';
    }
    html += '</tr></thead><tbody>';

    // Skip first row (rowIdx=0) since it would be all skip cells
    for (let rowIndex = 1; rowIndex < coreBlocks.length; rowIndex++) {
        const row = coreBlocks[rowIndex];
        if (row) {
            html += buildMatrixRow(ratioGraph, row, rowIndex, coreBlocks);
        }
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
    
    // Add close button handler
    container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
        getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
    });
}
