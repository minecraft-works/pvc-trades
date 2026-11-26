/**
 * Quick bar under the search fields: one-click "Paying" currencies
 * (exact match) and the "Deals only" / "Best per item" toggles.
 *
 * Keyboard: Alt+1…4 pick a currency, Alt+5 toggles deals only,
 * Alt+6 toggles best per item.
 *
 * @module quick-search/quick-bar
 */

import { QUICK_SEARCH } from '../constants.js';
import { toExactQuery } from '../search/query.js';

/** Dependencies from the host module */
export interface QuickBarDeps {
    /** The "Paying" search field */
    giveInput: HTMLInputElement;
    /** Put a new value into the "Paying" field and re-run the search */
    setGiveValue: (value: string) => void;
    /** Re-run the search after a toggle changed */
    search: () => void;
}

/** Public API */
export interface QuickBar {
    /** Current toggle state for the search */
    getFilters: () => { readonly dealsOnly: boolean; readonly bestPerItem: boolean };
    /** Refresh the pressed state of the currency chips (call after each search) */
    syncState: () => void;
    /** Handle Alt+1…6; returns true if the event was a quick-bar shortcut */
    handleShortcut: (event: KeyboardEvent) => boolean;
}

const ARIA_PRESSED = 'aria-pressed';
const DEALS_ONLY_LABEL = `Deals ≤ −${Math.abs(QUICK_SEARCH.DEALS_ONLY_MAX_PERCENT)}%`;

/**
 * Render the quick bar into its container and wire it up.
 * @param container - Element that receives the chips
 * @param deps - Host callbacks
 * @returns Quick bar handler
 */
export function createQuickBar(container: HTMLElement, deps: QuickBarDeps): QuickBar {
    let dealsOnly = false;
    let bestPerItem = false;

    const chips = QUICK_SEARCH.CURRENCIES.map((currency, index) => {
        const chip = createButton('quick-chip', currency, `Paying exactly ${currency} (Alt+${index + 1})`);
        // No visible "Paying:" label, so the accessible name carries that context
        chip.setAttribute('aria-label', `Pay with ${currency}`);
        chip.dataset.query = toExactQuery(currency);
        chip.addEventListener('click', () => { toggleCurrency(chip); });
        container.append(chip);
        return chip;
    });

    const separator = document.createElement('span');
    separator.className = 'quick-bar-separator';
    container.append(separator);

    const dealsToggle = createButton('quick-toggle', DEALS_ONLY_LABEL, 'Only trades at least 20% below market (Alt+5)');
    dealsToggle.id = 'deals-only-toggle';
    dealsToggle.addEventListener('click', () => {
        dealsOnly = !dealsOnly;
        dealsToggle.setAttribute(ARIA_PRESSED, String(dealsOnly));
        deps.search();
    });

    const bestToggle = createButton('quick-toggle', 'Best per item', 'Only the cheapest offer for each item (Alt+6)');
    bestToggle.id = 'best-per-item-toggle';
    bestToggle.addEventListener('click', () => {
        bestPerItem = !bestPerItem;
        bestToggle.setAttribute(ARIA_PRESSED, String(bestPerItem));
        deps.search();
    });
    container.append(dealsToggle, bestToggle);

    function toggleCurrency(chip: HTMLButtonElement): void {
        const query = chip.dataset.query ?? '';
        const isActive = deps.giveInput.value.trim().toLowerCase() === query;
        deps.setGiveValue(isActive ? '' : query);
    }

    function syncState(): void {
        const current = deps.giveInput.value.trim().toLowerCase();
        for (const chip of chips) {
            chip.setAttribute(ARIA_PRESSED, String(chip.dataset.query === current));
        }
    }

    function handleShortcut(event: KeyboardEvent): boolean {
        if (!event.altKey || event.ctrlKey || event.metaKey) { return false; }
        const digit = /^Digit(?<n>[1-6])$/.exec(event.code)?.groups?.n;
        if (!digit) { return false; }
        const buttons = [...chips, dealsToggle, bestToggle];
        buttons[Number(digit) - 1]?.click();
        return true;
    }

    syncState();

    return {
        getFilters: () => ({ dealsOnly, bestPerItem }),
        syncState,
        handleShortcut,
    };
}

/**
 * Create a toggle button
 * @param className - CSS class
 * @param text - Visible label
 * @param title - Tooltip including the shortcut
 * @returns Button with aria-pressed="false"
 */
function createButton(className: string, text: string, title: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.title = title;
    button.setAttribute(ARIA_PRESSED, 'false');
    return button;
}
