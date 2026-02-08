/**
 * Favorites Watchlist UI Module
 *
 * Handles:
 * - Favorites popover for adding/editing favorites with thresholds
 * - Favorites dialog listing all favorites
 * - Favorites badge count updates
 * - Filter toggle for showing only favorites
 *
 * @module favorites/favorites-ui
 */

import { escapeHtml } from '../library.js';
import { openDialog } from '../dialogs/dialog-utilities.js';
import type { FavoritesStore } from '../stores/favorites-store.js';

/** CSS selector for the favorite popover */
const FAVORITE_POPOVER_SELECTOR = '#favorite-popover';

/**
 * Check if favorites filter is active (standalone utility - no dependencies)
 */
export function isFavoritesFilterActive(): boolean {
    const filterButton = document.querySelector('#filter-favorites');
    return filterButton?.classList.contains('active') ?? false;
}

/**
 * Dependencies for the favorites UI module
 */
export interface FavoritesUIDependencies {
    /** Store for managing favorites */
    favoritesStore: FavoritesStore;
    /** Callback to trigger search refresh after favorite changes */
    triggerSearch: () => void;
}

/**
 * Favorites UI handler interface
 */
export interface FavoritesUIHandler {
    /** Show the favorite popover positioned near a button */
    showFavoritePopover: (button: HTMLElement, itemName: string) => void;
    /** Hide the favorite popover */
    hideFavoritePopover: () => void;
    /** Update the favorites badge count */
    updateFavoritesBadge: () => void;
    /** Setup the favorites dialog and popover event handlers */
    setupFavoritesDialog: () => void;
    /** Render the favorites dialog content */
    renderFavoritesDialog: () => void;
}

/** Internal state for the favorites UI */
interface FavoritesUIState {
    activePopoverItemName: string | undefined;
    handlePopoverOutsideClick: ((event: MouseEvent) => void) | undefined;
}

/** Update the favorites badge count */
function updateBadge(favoritesStore: FavoritesStore): void {
    const badge = document.querySelector('.favorites-badge') as HTMLElement;
    if (!badge) {
        return;
    }

    const count = favoritesStore.getAll().length;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
}

/** Render the favorites dialog content */
function renderDialog(favoritesStore: FavoritesStore): void {
    const list = document.querySelector('.favorites-list') as HTMLElement;
    const empty = document.querySelector('.favorites-empty') as HTMLElement;

    if (!list || !empty) {
        return;
    }

    const favorites = favoritesStore.getAll();

    // Toggle empty state
    list.classList.toggle('hidden', favorites.length === 0);
    empty.classList.toggle('hidden', favorites.length > 0);

    // Clear and rebuild list
    list.innerHTML = '';

    for (const fav of favorites) {
        const item = document.createElement('div');
        item.className = 'favorites-item';

        const thresholdText = fav.maxDeviation === undefined
            ? 'No threshold'
            : `Alert ≤${fav.maxDeviation}%`;

        item.innerHTML = `
            <span class="favorites-item-name">${escapeHtml(fav.itemName)}</span>
            <span class="favorites-item-threshold">${thresholdText}</span>
            <div class="favorites-item-actions">
                <button class="edit-favorite" data-item="${escapeHtml(fav.itemName)}" title="Edit">✏️</button>
                <button class="remove-favorite" data-item="${escapeHtml(fav.itemName)}" title="Remove">🗑️</button>
            </div>
        `;

        list.append(item);
    }
}

/** Hide the favorite popover and clean up */
function hidePopover(state: FavoritesUIState): void {
    const popover = document.querySelector(FAVORITE_POPOVER_SELECTOR) as HTMLElement;
    if (popover) {
        popover.classList.add('hidden');
    }
    state.activePopoverItemName = undefined;
    if (state.handlePopoverOutsideClick) {
        document.removeEventListener('click', state.handlePopoverOutsideClick);
    }
}

/** Position and show the popover near a button */
function positionAndShowPopover(popover: HTMLElement, button: HTMLElement): void {
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

/** Update popover UI elements based on favorite settings */
function updatePopoverUI(popover: HTMLElement, itemName: string, favoritesStore: FavoritesStore): void {
    // Update popover header
    const header = popover.querySelector('#popover-item-name') as HTMLElement;
    if (header) {
        header.textContent = itemName;
    }

    // Get current favorite settings
    const favorite = favoritesStore.get(itemName);
    const isFavorite = Boolean(favorite);
    const hasThreshold = favorite?.maxDeviation !== undefined;
    const thresholdValue = favorite?.maxDeviation === undefined ? 20 : Math.abs(favorite.maxDeviation);

    // Update radio buttons
    const anyPriceRadio = popover.querySelector('input[name="threshold-type"][value="any"]') as HTMLInputElement;
    const thresholdRadio = popover.querySelector('input[name="threshold-type"][value="threshold"]') as HTMLInputElement;
    const thresholdInput = popover.querySelector('#popover-threshold') as HTMLInputElement;

    if (anyPriceRadio && thresholdRadio && thresholdInput) {
        anyPriceRadio.checked = !hasThreshold;
        thresholdRadio.checked = hasThreshold;
        thresholdInput.value = String(thresholdValue);
    }

    // Show/hide buttons based on whether it's already a favorite
    const removeButton = popover.querySelector('#popover-remove') as HTMLElement;
    const saveButton = popover.querySelector('#popover-save') as HTMLElement;
    if (removeButton && saveButton) {
        removeButton.classList.toggle('hidden', !isFavorite);
        saveButton.classList.toggle('hidden', isFavorite);
    }
}

/** Read threshold value from popover form */
function readThresholdFromPopover(popover: HTMLElement): number | undefined {
    const thresholdRadio = popover.querySelector('input[name="threshold-type"][value="threshold"]') as HTMLInputElement;
    const thresholdInput = popover.querySelector('#popover-threshold') as HTMLInputElement;

    if (thresholdRadio?.checked && thresholdInput) {
        const value = Number.parseInt(thresholdInput.value, 10);
        return Number.isNaN(value) ? -20 : -Math.abs(value);
    }
    return undefined;
}

/**
 * Create a favorites UI handler
 */
export function createFavoritesUIHandler(dependencies: FavoritesUIDependencies): FavoritesUIHandler {
    const { favoritesStore, triggerSearch } = dependencies;

    // Local state for the popover
    const state: FavoritesUIState = {
        activePopoverItemName: undefined,
        handlePopoverOutsideClick: undefined
    };

    function hideFavoritePopover(): void {
        hidePopover(state);
    }

    // Create the outside click handler
    state.handlePopoverOutsideClick = (event: MouseEvent): void => {
        const popover = document.querySelector(FAVORITE_POPOVER_SELECTOR);
        const target = event.target as HTMLElement;
        if (popover && !popover.contains(target) && !target.classList.contains('favorite-star')) {
            hideFavoritePopover();
        }
    };

    function showFavoritePopover(button: HTMLElement, itemName: string): void {
        const popover = document.querySelector(FAVORITE_POPOVER_SELECTOR) as HTMLElement;
        if (!popover) {
            return;
        }

        state.activePopoverItemName = itemName;
        updatePopoverUI(popover, itemName, favoritesStore);
        positionAndShowPopover(popover, button);

        // Close when clicking outside (use setTimeout to avoid immediate close)
        setTimeout(() => {
            if (state.handlePopoverOutsideClick) {
                document.addEventListener('click', state.handlePopoverOutsideClick);
            }
        }, 0);
    }

    function saveFavoriteFromPopover(): void {
        if (!state.activePopoverItemName) {
            return;
        }
        const popover = document.querySelector(FAVORITE_POPOVER_SELECTOR) as HTMLElement;
        if (!popover) {
            return;
        }

        const maxDeviation = readThresholdFromPopover(popover);
        favoritesStore.add(state.activePopoverItemName, maxDeviation);
        hideFavoritePopover();
        triggerSearch();
        updateBadge(favoritesStore);
    }

    function removeFavoriteFromPopover(): void {
        if (!state.activePopoverItemName) {
            return;
        }
        favoritesStore.remove(state.activePopoverItemName);
        hideFavoritePopover();
        triggerSearch();
        updateBadge(favoritesStore);
    }

    function updateFavoritesBadge(): void {
        updateBadge(favoritesStore);
    }

    function renderFavoritesDialog(): void {
        renderDialog(favoritesStore);
    }

    function setupFavoritesDialog(): void {
        // Open favorites dialog
        document.querySelector('#open-favorites')?.addEventListener('click', () => {
            renderFavoritesDialog();
            openDialog('favorites-dialog');
        });

        // Close favorites dialog
        document.querySelector('#close-favorites')?.addEventListener('click', () => {
            (document.querySelector('#favorites-dialog') as HTMLDialogElement)?.close();
        });

        // Favorites list delegation
        document.querySelector('.favorites-content')?.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const itemName = target.dataset['item'];

            if (target.classList.contains('remove-favorite') && itemName) {
                favoritesStore.remove(itemName);
                renderFavoritesDialog();
                updateFavoritesBadge();
                triggerSearch();
            }

            if (target.classList.contains('edit-favorite') && itemName) {
                (document.querySelector('#favorites-dialog') as HTMLDialogElement)?.close();
                const starButton = document.querySelector(`.favorite-star[data-item="${itemName}"]`) as HTMLElement;
                showFavoritePopover(starButton ?? target, itemName);
            }
        });

        // Popover button handlers
        const popover = document.querySelector(FAVORITE_POPOVER_SELECTOR);
        popover?.querySelector('.btn-primary')?.addEventListener('click', saveFavoriteFromPopover);
        popover?.querySelector('.btn-secondary')?.addEventListener('click', hideFavoritePopover);
        popover?.querySelector('.btn-remove')?.addEventListener('click', removeFavoriteFromPopover);
        popover?.querySelector('.popover-close')?.addEventListener('click', hideFavoritePopover);

        // Filter favorites toggle
        document.querySelector('#filter-favorites')?.addEventListener('click', (event) => {
            (event.target as HTMLElement).classList.toggle('active');
            triggerSearch();
        });
    }

    return {
        showFavoritePopover,
        hideFavoritePopover,
        updateFavoritesBadge,
        setupFavoritesDialog,
        renderFavoritesDialog
    };
}
