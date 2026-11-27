/**
 * Quick bar under the search fields: the "Deals only", "Best per item" and
 * "Shulkers" toggles.
 *
 * Keyboard: Alt+1, Alt+2 and Alt+3 toggle them in that order.
 *
 * @module quick-search/quick-bar
 */

import { QUICK_SEARCH } from '../constants.js';
import type { QuickFilters } from '../types.js';

/** Dependencies from the host module */
export interface QuickBarDeps {
    /** Re-run the search after a toggle changed */
    search: () => void;
}

/** Public API */
export interface QuickBar {
    /** Current toggle state for the search */
    getFilters: () => QuickFilters;
    /** Handle Alt+1…3; returns true if the event was a quick-bar shortcut */
    handleShortcut: (event: KeyboardEvent) => boolean;
}

interface ToggleSpec {
    readonly filter: keyof QuickFilters;
    readonly id: string;
    readonly label: string;
    readonly title: string;
}

const TOGGLES: readonly ToggleSpec[] = [
    {
        filter: 'dealsOnly',
        id: 'deals-only-toggle',
        label: `Deals ≤ −${Math.abs(QUICK_SEARCH.DEALS_ONLY_MAX_PERCENT)}%`,
        title: `Only trades at least ${Math.abs(QUICK_SEARCH.DEALS_ONLY_MAX_PERCENT)}% below market`,
    },
    { filter: 'bestPerItem', id: 'best-per-item-toggle', label: 'Best per item', title: 'Only the cheapest offer for each item' },
    { filter: 'shulkersOnly', id: 'shulkers-only-toggle', label: 'Shulkers', title: 'Only trades that buy or sell a filled shulker box' },
];

/**
 * Render the quick bar into its container and wire it up.
 * @param container - Element that receives the toggles
 * @param deps - Host callbacks
 * @returns Quick bar handler
 */
export function createQuickBar(container: HTMLElement, deps: QuickBarDeps): QuickBar {
    const state: Record<keyof QuickFilters, boolean> = { dealsOnly: false, bestPerItem: false, shulkersOnly: false };

    const buttons = TOGGLES.map((spec, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quick-toggle';
        button.id = spec.id;
        button.textContent = spec.label;
        button.title = `${spec.title} (Alt+${index + 1})`;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
            state[spec.filter] = !state[spec.filter];
            button.setAttribute('aria-pressed', String(state[spec.filter]));
            deps.search();
        });
        container.append(button);
        return button;
    });

    function handleShortcut(event: KeyboardEvent): boolean {
        if (!event.altKey || event.ctrlKey || event.metaKey) { return false; }
        const digit = /^Digit(?<n>\d)$/.exec(event.code)?.groups?.n;
        const button = digit ? buttons[Number(digit) - 1] : undefined;
        if (!button) { return false; }
        button.click();
        return true;
    }

    return {
        getFilters: () => ({ ...state }),
        handleShortcut,
    };
}