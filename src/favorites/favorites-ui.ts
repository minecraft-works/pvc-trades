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

/** CSS class for hiding elements */
const HIDDEN_CLASS = 'hidden';

/** CSS selector for item name input */
const ITEM_NAME_INPUT_SELECTOR = '.favorites-item-name-input';

/**
 * Enter inline edit mode for a favorites row (module-level utility function)
 */
function enterEditMode(itemRow: HTMLElement): void {
    // Show edit controls, hide display controls
    itemRow.querySelector('.favorites-item-display')?.classList.add(HIDDEN_CLASS);
    itemRow.querySelector('.favorites-item-edit')?.classList.remove(HIDDEN_CLASS);

    // Switch edit to save button, hide delete
    itemRow.querySelector('.edit-favorite')?.classList.add(HIDDEN_CLASS);
    itemRow.querySelector('.save-favorite')?.classList.remove(HIDDEN_CLASS);
    itemRow.querySelector('.remove-favorite')?.classList.add(HIDDEN_CLASS);

    // Focus the input
    const input = itemRow.querySelector(ITEM_NAME_INPUT_SELECTOR) as HTMLInputElement;
    input?.focus();
    input?.select();
}

/**
 * Check if favorites filter is active (standalone utility - no dependencies)
 */
export function isFavoritesFilterActive(): boolean {
    const headerStar = document.querySelector('.fav-col-header');
    return headerStar?.classList.contains('active') ?? false;
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
    /** Update the deals badge with count of trades meeting thresholds */
    updateDealsBadge: (dealsCount: number) => void;
    /** Setup the favorites dialog and popover event handlers */
    setupFavoritesDialog: () => void;
    /** Render the favorites dialog content */
    renderFavoritesDialog: () => void;
    /** Open the favorites dialog for a specific item (highlight if exists, pre-fill if new) */
    openDialogForItem: (itemName: string) => void;
}

/** Internal state for the favorites UI */
interface FavoritesUIState {
    activePopoverItemName: string | undefined;
    handlePopoverOutsideClick: ((event: MouseEvent) => void) | undefined;
}

/** Update the favorites badge count (number of watched items) */
function updateBadge(favoritesStore: FavoritesStore): void {
    const badge = document.querySelector('.favorites-badge') as HTMLElement;
    if (!badge) {
        return;
    }

    const count = favoritesStore.getAll().length;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
    // Reset deals highlight when updating favorites count
    badge.classList.remove('has-deals');
}

/** Update the deals badge with count of trades meeting thresholds */
function updateDealsBadgeElement(dealsCount: number): void {
    const badge = document.querySelector('.favorites-badge') as HTMLElement;
    if (!badge) {
        return;
    }

    badge.textContent = String(dealsCount);
    badge.classList.toggle('hidden', dealsCount === 0);
    badge.classList.toggle('has-deals', dealsCount > 0);
}

/** Build threshold display text and select value from deviation */
function buildThresholdValues(maxDeviation: number | undefined): { text: string; value: string } {
    if (maxDeviation === undefined) {
        return { text: '', value: '' };
    }
    return { text: `≤${maxDeviation}%`, value: String(maxDeviation) };
}

/** Create the HTML for a favorite item row */
function createFavoriteItemElement(fav: { itemName: string; maxDeviation?: number }): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'favorites-item';
    item.dataset['item'] = fav.itemName;

    const { text: thresholdText, value: thresholdValue } = buildThresholdValues(fav.maxDeviation);

    item.innerHTML = `
        <div class="favorites-item-content">
            <div class="favorites-item-display">
                <span class="favorites-item-name">${escapeHtml(fav.itemName)}</span>
                ${thresholdText ? `<span class="favorites-item-threshold">${thresholdText}</span>` : ''}
            </div>
            <div class="favorites-item-edit hidden">
                <input type="text" class="favorites-item-name-input" value="${escapeHtml(fav.itemName)}">
                <select class="favorites-threshold-select" title="Only show trades with deviation at or below this value">
                    <option value=""${thresholdValue === '' ? ' selected' : ''}>Deal</option>
                    <option value="-25"${thresholdValue === '-25' ? ' selected' : ''}>≤-25%</option>
                    <option value="-50"${thresholdValue === '-50' ? ' selected' : ''}>≤-50%</option>
                    <option value="-75"${thresholdValue === '-75' ? ' selected' : ''}>≤-75%</option>
                    <option value="-100"${thresholdValue === '-100' ? ' selected' : ''}>≤-100%</option>
                </select>
            </div>
        </div>
        <div class="favorites-item-actions">
            <button class="remove-favorite" data-item="${escapeHtml(fav.itemName)}" title="Remove">🗑️</button>
            <button class="save-favorite hidden" data-item="${escapeHtml(fav.itemName)}" title="Save">💾</button>
            <button class="edit-favorite" data-item="${escapeHtml(fav.itemName)}" title="Edit">✏️</button>
        </div>
    `;

    return item;
}

/** Create the "add new item" row HTML */
function createAddRow(): HTMLDivElement {
    const addRow = document.createElement('div');
    addRow.className = 'favorites-item favorites-item-add';
    addRow.innerHTML = `
        <div class="favorites-item-content">
            <input type="text" class="favorites-item-name-input" id="favorites-new-item-input" placeholder="Enter item name...">
            <select class="favorites-threshold-select" id="favorites-new-threshold-select" title="Only show trades with deviation at or below this value">
                <option value="" selected>Deal</option>
                <option value="-25">≤-25%</option>
                <option value="-50">≤-50%</option>
                <option value="-75">≤-75%</option>
                <option value="-100">≤-100%</option>
            </select>
        </div>
        <div class="favorites-item-actions">
            <button class="add-favorite-btn" title="Add to watchlist">💾</button>
        </div>
    `;
    return addRow;
}

/** Render the favorites dialog content */
function renderDialog(favoritesStore: FavoritesStore): void {
    const list = document.querySelector('.favorites-list') as HTMLElement;
    const empty = document.querySelector('.favorites-empty') as HTMLElement;

    if (!list || !empty) {
        return;
    }

    const favorites = favoritesStore.getAll();

    // Toggle empty state - but always show if we have the add row
    list.classList.remove('hidden');
    empty.classList.toggle('hidden', favorites.length > 0);

    // Clear and rebuild list
    list.innerHTML = '';

    // Render existing favorites
    for (const fav of favorites) {
        list.append(createFavoriteItemElement(fav));
    }

    // Add the "new item" row at the bottom
    list.append(createAddRow());
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
 *
 * This is a factory function that creates related event handlers and utilities.
 * The inner functions share common state and dependencies, making extraction impractical.
 */
// eslint-disable-next-line max-lines-per-function
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

    /** Save inline edits for a favorites row */
    function saveInlineEdit(itemRow: HTMLElement): void {
        const originalName = itemRow.dataset['item'];
        if (!originalName) {
            return;
        }

        const input = itemRow.querySelector(ITEM_NAME_INPUT_SELECTOR) as HTMLInputElement;
        const newName = input?.value.trim().toLowerCase();

        if (!newName) {
            return;
        }

        // Read threshold from select dropdown
        const select = itemRow.querySelector('.favorites-threshold-select') as HTMLSelectElement;
        const maxDeviation = select?.value ? Number.parseInt(select.value, 10) : undefined;

        // Remove old and add new (handles rename)
        if (newName !== originalName) {
            favoritesStore.remove(originalName);
        }
        favoritesStore.add(newName, maxDeviation);

        renderFavoritesDialog();
        updateFavoritesBadge();
        triggerSearch();
    }

    /** Add new item from the inline add row */
    function addNewFromInlineRow(itemRow: HTMLElement): void {
        const input = itemRow.querySelector(ITEM_NAME_INPUT_SELECTOR) as HTMLInputElement;
        const itemName = input?.value.trim().toLowerCase();

        if (!itemName) {
            return;
        }

        // Read threshold from select dropdown
        const select = itemRow.querySelector('.favorites-threshold-select') as HTMLSelectElement;
        const maxDeviation = select?.value ? Number.parseInt(select.value, 10) : undefined;

        favoritesStore.add(itemName, maxDeviation);
        renderFavoritesDialog();
        updateFavoritesBadge();
        triggerSearch();
    }

    function setupFavoritesDialog(): void {
        // Close favorites dialog
        document.querySelector('#close-favorites')?.addEventListener('click', () => {
            (document.querySelector('#favorites-dialog') as HTMLDialogElement)?.close();
        });

        // Favorites list delegation
        document.querySelector('.favorites-content')?.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const itemRow = target.closest('.favorites-item') as HTMLElement;
            const itemName = target.dataset['item'];

            // Delete button
            if (target.classList.contains('remove-favorite') && itemName) {
                favoritesStore.remove(itemName);
                renderFavoritesDialog();
                updateFavoritesBadge();
                triggerSearch();
            }

            // Edit button - switch to inline edit mode
            if (target.classList.contains('edit-favorite') && itemName && itemRow) {
                enterEditMode(itemRow);
            }

            // Save button - save inline edits
            if (target.classList.contains('save-favorite') && itemRow) {
                saveInlineEdit(itemRow);
            }

            // Add button - add new item
            if (target.classList.contains('add-favorite-btn') && itemRow) {
                addNewFromInlineRow(itemRow);
            }
        });

        // Popover button handlers
        const popover = document.querySelector(FAVORITE_POPOVER_SELECTOR);
        popover?.querySelector('.btn-primary')?.addEventListener('click', saveFavoriteFromPopover);
        popover?.querySelector('.btn-secondary')?.addEventListener('click', hideFavoritePopover);
        popover?.querySelector('.btn-remove')?.addEventListener('click', removeFavoriteFromPopover);
        popover?.querySelector('.popover-close')?.addEventListener('click', hideFavoritePopover);

        // Add to watchlist button (in search input) - opens dialog with search query
        document.querySelector('#add-to-watchlist')?.addEventListener('click', () => {
            const searchInput = document.querySelector('#searchWant') as HTMLInputElement;
            const query = searchInput?.value.trim() ?? '';
            openDialogForItem(query);
        });

        // Add new item from inline form
        document.querySelector('#favorites-add-confirm')?.addEventListener('click', () => {
            addNewItemFromInlineForm();
        });

        // Also allow Enter key in the input field
        document.querySelector('#favorites-item-input')?.addEventListener('keydown', (event) => {
            if ((event as KeyboardEvent).key === 'Enter') {
                addNewItemFromInlineForm();
            }
        });
    }

    function addNewItemFromInlineForm(): void {
        const input = document.querySelector('#favorites-item-input') as HTMLInputElement;
        const itemName = input?.value.trim().toLowerCase();

        if (!itemName) {
            return;
        }

        // Read threshold from inline form
        const thresholdRadio = document.querySelector('input[name="new-threshold-type"][value="threshold"]') as HTMLInputElement;
        const thresholdInput = document.querySelector('#favorites-new-threshold') as HTMLInputElement;
        let maxDeviation: number | undefined;

        if (thresholdRadio?.checked && thresholdInput) {
            const value = Number.parseInt(thresholdInput.value, 10);
            maxDeviation = Number.isNaN(value) ? -20 : -Math.abs(value);
        }

        favoritesStore.add(itemName, maxDeviation);

        // Clear the input and reset form
        input.value = '';
        const anyPriceRadio = document.querySelector('input[name="new-threshold-type"][value="any"]') as HTMLInputElement;
        if (anyPriceRadio) {
            anyPriceRadio.checked = true;
        }

        renderFavoritesDialog();
        updateFavoritesBadge();
        triggerSearch();
    }

    /** Open the favorites dialog with a specific item selected or pre-filled */
    function openDialogForItem(itemName: string): void {
        // First render and open the dialog
        renderFavoritesDialog();
        openDialog('favorites-dialog');

        const list = document.querySelector('.favorites-list') as HTMLElement;
        if (!list) {
            return;
        }

        // Normalize to match how items are stored (lowercase, trimmed)
        const normalizedName = itemName.toLowerCase().trim();

        // Check if item already exists in favorites
        const existingRow = list.querySelector(`[data-item="${CSS.escape(normalizedName)}"]`) as HTMLElement;
        
        if (existingRow) {
            // Item exists - scroll to it and enter edit mode
            existingRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            enterEditMode(existingRow);
        } else {
            // Item doesn't exist - pre-fill the add form
            const addInput = list.querySelector('#favorites-new-item-input') as HTMLInputElement;
            if (addInput) {
                addInput.value = itemName;
                addInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                addInput.focus();
                addInput.select();
            }
        }
    }

    return {
        showFavoritePopover,
        hideFavoritePopover,
        updateFavoritesBadge,
        updateDealsBadge: updateDealsBadgeElement,
        setupFavoritesDialog,
        renderFavoritesDialog,
        openDialogForItem
    };
}
