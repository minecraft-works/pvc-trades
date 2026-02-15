/**
 * Favorites Popover Utilities
 *
 * Contains popover positioning, threshold controls, and state management
 * for the favorite star popover UI.
 *
 * @module favorites/favorites-popover
 */

import type { FavoritesStore } from '../stores/favorites-store.js';

/** CSS selector for the favorite popover */
export const FAVORITE_POPOVER_SELECTOR = '#favorite-popover';

/** Internal state for the favorites UI */
export interface FavoritesUIState {
    activePopoverItemName: string | undefined;
    handlePopoverOutsideClick: ((event: MouseEvent) => void) | undefined;
}

/** Hide the favorite popover and clean up */
export function hidePopover(state: FavoritesUIState): void {
    const popover = document.querySelector(FAVORITE_POPOVER_SELECTOR);
    if (popover) {
        popover.classList.add('hidden');
    }
    state.activePopoverItemName = undefined;
    if (state.handlePopoverOutsideClick) {
        document.removeEventListener('click', state.handlePopoverOutsideClick);
    }
}

/** Position and show the popover near a button */
export function positionAndShowPopover(popover: HTMLElement, button: HTMLElement): void {
    const rect = button.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.left = `${Math.max(8, rect.left - 100)}px`;
        popover.style.transform = 'none';
    } else {
        // Button not visible, center popover on screen
        popover.style.top = '50%';
        popover.style.left = '50%';
        popover.style.transform = 'translate(-50%, -50%)';
    }
    popover.classList.remove('hidden');
}

/** Update threshold radio buttons and input in popover */
export function updatePopoverThresholdControls(
    popover: HTMLElement,
    hasThreshold: boolean,
    thresholdValue: number
): void {
    const anyPriceRadio = popover.querySelector('input[name="threshold-type"][value="any"]');
    const thresholdRadio = popover.querySelector('input[name="threshold-type"][value="threshold"]');
    const thresholdInput = popover.querySelector('#popover-threshold');

    const isValidRadioGroup =
        anyPriceRadio instanceof HTMLInputElement &&
        thresholdRadio instanceof HTMLInputElement &&
        thresholdInput instanceof HTMLInputElement;

    if (isValidRadioGroup) {
        anyPriceRadio.checked = !hasThreshold;
        thresholdRadio.checked = hasThreshold;
        thresholdInput.value = String(thresholdValue);
    }
}

/** Update popover UI elements based on favorite settings */
export function updatePopoverUI(popover: HTMLElement, itemName: string, favoritesStore: FavoritesStore): void {
    // Update popover header
    const header = popover.querySelector('#popover-item-name');
    if (header) {
        header.textContent = itemName;
    }

    // Get current favorite settings
    const favorite = favoritesStore.get(itemName);
    const isFavorite = Boolean(favorite);
    const hasThreshold = favorite?.maxDeviation !== undefined;
    const thresholdValue = favorite?.maxDeviation === undefined ? 20 : Math.abs(favorite.maxDeviation);

    // Update radio buttons
    updatePopoverThresholdControls(popover, hasThreshold, thresholdValue);

    // Show/hide buttons based on whether it's already a favorite
    const removeButton = popover.querySelector('#popover-remove');
    const saveButton = popover.querySelector('#popover-save');
    if (removeButton && saveButton) {
        removeButton.classList.toggle('hidden', !isFavorite);
        saveButton.classList.toggle('hidden', isFavorite);
    }
}

/** Read threshold value from popover form */
export function readThresholdFromPopover(popover: HTMLElement): number | undefined {
    const thresholdRadio = popover.querySelector('input[name="threshold-type"][value="threshold"]');
    const thresholdInput = popover.querySelector('#popover-threshold');

    if (thresholdRadio && thresholdRadio instanceof HTMLInputElement && thresholdRadio.checked &&
        thresholdInput && thresholdInput instanceof HTMLInputElement) {
        const value = Number.parseInt(thresholdInput.value, 10);
        return Number.isNaN(value) ? -20 : -Math.abs(value);
    }
    return undefined;
}
