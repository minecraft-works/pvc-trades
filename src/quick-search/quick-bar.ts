/**
 * Quick bar under the search fields: the "Deals only" and "Best per item"
 * toggles.
 *
 * Keyboard: Alt+1 toggles deals only, Alt+2 toggles best per item.
 *
 * @module quick-search/quick-bar
 */

import { QUICK_SEARCH } from '../constants.js';

/** Dependencies from the host module */
export interface QuickBarDeps {
    /** Re-run the search after a toggle changed */
    search: () => void;
}

/** Public API */
export interface QuickBar {
    /** Current toggle state for the search */
    getFilters: () => { readonly dealsOnly: boolean; readonly bestPerItem: boolean };
    /** Handle Alt+1/Alt+2; returns true if the event was a quick-bar shortcut */
    handleShortcut: (event: KeyboardEvent) => boolean;
}

const ARIA_PRESSED = 'aria-pressed';
const DEALS_ONLY_LABEL = `Deals ≤ −${Math.abs(QUICK_SEARCH.DEALS_ONLY_MAX_PERCENT)}%`;

/**
 * Render the quick bar into its container and wire it up.
 * @param container - Element that receives the toggles
 * @param deps - Host callbacks
 * @returns Quick bar handler
 */
export function createQuickBar(container: HTMLElement, deps: QuickBarDeps): QuickBar {
    let dealsOnly = false;
    let bestPerItem = false;

    const dealsToggle = createButton(DEALS_ONLY_LABEL, 'Only trades at least 20% below market (Alt+1)');
    dealsToggle.id = 'deals-only-toggle';
    dealsToggle.addEventListener('click', () => {
        dealsOnly = !dealsOnly;
        dealsToggle.setAttribute(ARIA_PRESSED, String(dealsOnly));
        deps.search();
    });

    const bestToggle = createButton('Best per item', 'Only the cheapest offer for each item (Alt+2)');
    bestToggle.id = 'best-per-item-toggle';
    bestToggle.addEventListener('click', () => {
        bestPerItem = !bestPerItem;
        bestToggle.setAttribute(ARIA_PRESSED, String(bestPerItem));
        deps.search();
    });
    container.append(dealsToggle, bestToggle);

    function handleShortcut(event: KeyboardEvent): boolean {
        if (!event.altKey || event.ctrlKey || event.metaKey) { return false; }
        const digit = /^Digit(?<n>[12])$/.exec(event.code)?.groups?.n;
        if (!digit) { return false; }
        (digit === '1' ? dealsToggle : bestToggle).click();
        return true;
    }

    return {
        getFilters: () => ({ dealsOnly, bestPerItem }),
        handleShortcut,
    };
}

/**
 * Create a toggle button
 * @param text - Visible label
 * @param title - Tooltip including the shortcut
 * @returns Button with aria-pressed="false"
 */
function createButton(text: string, title: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-toggle';
    button.textContent = text;
    button.title = title;
    button.setAttribute(ARIA_PRESSED, 'false');
    return button;
}