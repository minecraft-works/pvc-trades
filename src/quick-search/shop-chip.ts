/**
 * Chip under the search fields showing the shop or owner the results are
 * limited to, with a ✕ to show all shops again.
 *
 * @module quick-search/shop-chip
 */

import { formatShopFilter } from '../search/shop-filter.js';
import type { ShopFilter } from '../types.js';

/** Public API */
export interface ShopFilterChip {
    /** Current filter, if any */
    get: () => ShopFilter | undefined;
    /** Show a filter (or none); does not re-run the search */
    set: (filter: ShopFilter | undefined) => void;
}

/**
 * Render the shop filter chip into its container.
 * @param container - Element that receives the chip (hidden while no filter is set)
 * @param onCleared - Called after the user removed the filter, e.g. to re-run the search
 * @returns Chip handler
 */
export function createShopFilterChip(container: HTMLElement, onCleared: () => void): ShopFilterChip {
    let current: ShopFilter | undefined;

    function render(): void {
        container.replaceChildren();
        container.classList.toggle('hidden', current === undefined);
        if (!current) { return; }

        // Reads on from the Buying field: "at C418 Records" or "by 5thGearDrifting"
        const prefix = document.createElement('span');
        prefix.className = 'shop-filter-prefix';
        prefix.textContent = current.shop ? 'at' : 'by';

        const label = document.createElement('span');
        label.className = 'shop-filter-label';
        label.textContent = current.shop ?? current.owner;

        container.title = current.shop ? `Only trades from ${formatShopFilter(current)}` : `Only trades from shops of ${current.owner}`;
        container.setAttribute('aria-label', `Shop filter: ${formatShopFilter(current)}`);

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'shop-filter-clear';
        clear.setAttribute('aria-label', 'Show all shops');
        clear.title = 'Show all shops';
        clear.textContent = '✕';
        clear.addEventListener('click', () => {
            set(undefined);
            onCleared();
        });

        container.append(prefix, label, clear);
    }

    function set(filter: ShopFilter | undefined): void {
        current = filter;
        render();
    }

    render();
    return { get: () => current, set };
}
