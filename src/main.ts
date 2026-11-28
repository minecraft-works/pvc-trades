/**
 * Main application entry point for Shop Trade Viewer
 *
 * This module handles DOM initialization, event binding, and wiring
 * together extracted modules via a factory/dependency-injection pattern.
 *
 * Most logic has been extracted into focused modules:
 * - `src/data/`        — Trade loading, refresh, item-value state
 * - `src/search/`      — Search, filtering, multi-column sort
 * - `src/rendering/`   — Trade row rendering, virtual scrolling
 * - `src/cart/`         — Cart dialog, route timeline
 * - `src/navigation/`  — Live navigation, player polling
 * - `src/dialogs/`     — Matrix dialog, trade details
 * - `src/dashboard/`   — Daily deals dashboard
 * - `src/favorites/`   — Watchlist UI
 * - `src/map/`         — Shop map dialog, tile loading
 *
 * @module main
 */

import type { CartDialogHandler } from './cart/index.js';
import {
    cleanupZeroQuantityItems,
    clearCart,
    computeRoute,
    createCartDialogHandler,
    getAllCartStops,
    refreshCartButtonStates,
    syncNavProgressWithCart,
    updateCartBadge,
} from './cart/index.js';
import {
    CSS_CLASSES,
    DIALOG_IDS,
    QUICK_SEARCH,
    SELECTORS,
    STORAGE_KEYS,
    WORLDS} from './constants.js';
import type { DashboardUIHandler } from './dashboard/dashboard-ui.js';
import { createDashboardUIHandler } from './dashboard/dashboard-ui.js';
import type { DataLoaderHandler } from './data-loader/index.js';
import { createDataLoaderHandler } from './data-loader/index.js';
import { debugNavigation } from './debug.js';
import {
    createTradeDetailsHandler,
    openDialog,
    setupDialogBackdropClose} from './dialogs/index.js';
import type * as MatrixDialogModule from './dialogs/matrix-dialog.js';
import type { FavoritesUIHandler } from './favorites/index.js';
import { createFavoritesUIHandler } from './favorites/index.js';
import type { ShopMapDialogHandler } from './map/index.js';
import {
    createShopMapDialogHandler
} from './map/index.js';
import { prefetchLeaflet } from './map/leaflet.js';
import { getTradeKey } from './map/map-math.js';
import type { LiveNavigationHandler,NavMapHandler, NavUpdatesHandler } from './navigation/index.js';
import { createLiveNavigationHandler,createNavMapHandler, createNavState, createNavUpdatesHandler, createShopTooltipHandler } from './navigation/index.js';
import type { Autocomplete } from './quick-search/autocomplete.js';
import { createAutocomplete } from './quick-search/autocomplete.js';
import { createFieldMenu, type FieldMenuDeps } from './quick-search/field-menu.js';
import { createScopePills, handleFilterShortcut, type ScopePills } from './quick-search/scope-pills.js';
import type { UrlSearchState, UrlSync } from './quick-search/url-sync.js';
import { createUrlSync } from './quick-search/url-sync.js';
import type { TradeRendererHandler } from './rendering/index.js';
import { createTradeRendererHandler } from './rendering/index.js';
import { loadBiomeRules } from './search/biomes.js';
import type { SearchSortHandler } from './search/index.js';
import { createSearchSortHandler, updateClearButtonVisibility } from './search/index.js';
import { collectItemNames } from './search/query.js';
import { EMPTY_SCOPE, removeLastPill } from './search/scope.js';
import { collectShopLocations, collectShopSuggestions, type ShopLocation, type ShopSuggestion, summarizeOwner, summarizeShopAt } from './search/shop-filter.js';
import { getConfig } from './stores/index.js';
import { cartStore, favoritesStore, navigationStore, playerPositionService, searchScopeStore, snapshotStore } from './stores/index.js';
import type { ShopFilter, Trade } from './types.js';
import type * as FlipsModule from './valuation/flips.js';
import type { Flip } from './valuation/flips.js';

// ============================================================================
// State
// ============================================================================

// Data loader handler (initialized in DOMContentLoaded)
let dataLoader: DataLoaderHandler;

// Favorites UI handler (initialized in DOMContentLoaded)
let favoritesUI: FavoritesUIHandler;

// Dashboard UI handler (initialized in DOMContentLoaded)
let dashboardUI: DashboardUIHandler;

// Shop map dialog handler (initialized in DOMContentLoaded)
let shopMapDialog: ShopMapDialogHandler;

// Navigation module handlers (initialized in DOMContentLoaded)
const navState = createNavState();
let navMapHandler: NavMapHandler;
let navUpdatesHandler: NavUpdatesHandler;
let liveNav: LiveNavigationHandler;

// Cart dialog handler (initialized in DOMContentLoaded)
let cartHandler: CartDialogHandler;

// Trade renderer handler (initialized in DOMContentLoaded)
let renderer: TradeRendererHandler;

// Search/sort handler (initialized in DOMContentLoaded)
let searchHandler: SearchSortHandler;

// Quick search helpers (initialized in DOMContentLoaded)
let scopePills: ScopePills;
let urlSync: UrlSync;
let wantAutocomplete: Autocomplete;
let giveAutocomplete: Autocomplete;
// True while URL state is being applied, which runs its own search (or none before data loads)
let applyingSearchState = false;
/** Whether the biome item rules were asked for, see loadBiomes */
let biomesRequested = false;
let suggestionSource: { trades: readonly Trade[]; names: ReturnType<typeof collectItemNames> } | undefined;
let shopSuggestionSource: { trades: readonly Trade[]; suggestions: readonly ShopSuggestion[] } | undefined;
let shopLocationSource: { trades: readonly Trade[]; locations: readonly ShopLocation[] } | undefined;

// Flag to track if map was opened from cart (for back navigation)
let mapOpenedFromCart = false;

// ============================================================================
// DOM Helpers
// ============================================================================

const CLEAR_SEARCH_WANT_ID = 'clear-search-want';
const CLEAR_SEARCH_GIVE_ID = 'clear-search-give';
const SEARCH_WANT_ID = 'searchWant';
const SEARCH_GIVE_ID = 'searchGive';

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.querySelector<T>(`#${id}`);
    if (!element) { throw new Error(`Element #${id} not found`); }
    return element;
}

function getInputValue(id: string): string {
    return getElement<HTMLInputElement>(id).value.trim().toLowerCase();
}

// ============================================================================
// Exchange Rates Dialog (loaded on demand, ADR-021)
// ============================================================================

type ExchangeRatesModules = readonly [typeof MatrixDialogModule, typeof FlipsModule];
let exchangeRatesLoading: Promise<ExchangeRatesModules> | undefined;

/**
 * Load the exchange rates dialog and flip finder (once). They are a separate
 * chunk: the dialog is opened rarely and is not needed for the first render.
 * @returns The dialog and flips modules
 */
function loadExchangeRates(): Promise<ExchangeRatesModules> {
    exchangeRatesLoading ??= Promise.all([
        import('./dialogs/matrix-dialog.js'),
        import('./valuation/flips.js'),
    ] as const).catch((error: unknown) => {
        exchangeRatesLoading = undefined;
        throw error;
    });
    return exchangeRatesLoading;
}

/**
 * Open the exchange rates dialog, loading its code first if needed
 */
async function openMatrixDialog(): Promise<void> {
    const [{ renderExchangeMatrix }, { findFlips }] = await loadExchangeRates();
    openDialog(DIALOG_IDS.MATRIX, () => {
        renderExchangeMatrix(getElement('matrix-container'), dataLoader.getValuation()?.currencies, getElement, {
            getFlips: () => getFlips(findFlips),
            addToCart: addFlipToCart,
            isInCart: flip => cartStore.has(flip.buy.trade) && cartStore.has(flip.sell.trade),
            openShop: trade => { shopMapDialog.open(trade.x, trade.y, trade.z, trade.world); },
        });
    });
}

/**
 * Profitable round trips between shops, ranked by emerald value of the profit
 * @param findFlips - Flip finder from the lazily loaded flips module
 * @returns Flips, best first
 */
function getFlips(findFlips: typeof FlipsModule.findFlips): readonly Flip[] {
    const valuation = dataLoader.getValuation();
    const currencies = new Set(valuation?.currencies.currencies.map(name => name.toLowerCase()));
    return findFlips(dataLoader.getAllTrades(), {
        getValue: valuation ? (name: string) => valuation.getValue(name) : undefined,
        isCurrency: name => currencies.has(name.toLowerCase()),
    });
}

/**
 * Put both legs of a flip in the cart, using each trade as often as one trip needs
 * @param flip - Flip to add
 */
function addFlipToCart(flip: Flip): void {
    for (const leg of [flip.buy, flip.sell]) {
        if (!cartStore.has(leg.trade)) { cartStore.add(leg.trade); }
        cartStore.setQuantity(leg.trade, leg.uses);
    }
    refreshCartButtonStates();
}

// ============================================================================
// Trade Details Dialog (uses extracted module)
// ============================================================================

/**
 * Trade details popover handler, configured with trade lookup
 */
const openTradeDetailsPopover = createTradeDetailsHandler({
    getTrade: (key) => dataLoader.getTradeByKey(key)
});

// ============================================================================
// Tab Switching
// ============================================================================

const TAB_CART_SELECTOR = '#tab-cart';
const TAB_NAVIGATE_SELECTOR = '#tab-navigate';

function setupCartTabs(): void {
    const tabCart = document.querySelector(TAB_CART_SELECTOR);
    const tabNavigate = document.querySelector(TAB_NAVIGATE_SELECTOR);
    
    tabCart?.addEventListener('click', () => switchTab('cart'));
    tabNavigate?.addEventListener('click', () => switchTab('navigate'));

    // Arrow keys move between tabs (WAI-ARIA tabs pattern)
    document.querySelector('.cart-tabs')?.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent) || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) { return; }
        event.preventDefault();
        const isCartActive = tabCart?.classList.contains('active') ?? true;
        switchTab(isCartActive ? 'navigate' : 'cart');
        document.querySelector<HTMLElement>(isCartActive ? TAB_NAVIGATE_SELECTOR : TAB_CART_SELECTOR)?.focus();
    });
}

/**
 * Mark a tab as selected/unselected for assistive technology and keyboard focus
 * @param selector - CSS selector for the tab button
 * @param selected - Whether the tab is selected
 */
function setTabSelected(selector: string, selected: boolean): void {
    const tab = document.querySelector<HTMLElement>(selector);
    if (!tab) { return; }
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
}

/**
 * Toggle CSS class on an element if it exists
 * @param selector - CSS selector for the target element
 * @param active - Whether to add (true) or remove (false) the active class
 */
function setActive(selector: string, active: boolean): void {
    const element = document.querySelector(selector);
    if (!element) { return; }
    element.classList.toggle('active', active);
}

/**
 * Toggle CSS class 'hidden' on an element if it exists
 * @param selector - CSS selector for the target element
 * @param hidden - Whether to add (true) or remove (false) the hidden class
 */
function setHidden(selector: string, hidden: boolean): void {
    const element = document.querySelector(selector);
    if (!element) { return; }
    element.classList.toggle('hidden', hidden);
}

function switchTab(tab: 'cart' | 'navigate'): void {
    const isCart = tab === 'cart';

    setActive(TAB_CART_SELECTOR, isCart);
    setActive(TAB_NAVIGATE_SELECTOR, !isCart);
    setTabSelected(TAB_CART_SELECTOR, isCart);
    setTabSelected(TAB_NAVIGATE_SELECTOR, !isCart);
    setActive('#tab-content-cart', isCart);
    setActive('#tab-content-navigate', !isCart);
    setHidden('#clear-cart', !isCart);
    setHidden('#start-navigation', isCart);

    if (!isCart) {
        liveNav.renderNavigateTab();
    }

    localStorage.setItem(STORAGE_KEYS.NAV_TAB, tab);
}

function restoreActiveTab(): void {
    const savedTab = localStorage.getItem(STORAGE_KEYS.NAV_TAB);
    if (savedTab === 'navigate') {
        switchTab('navigate');
    } else {
        switchTab('cart');
    }
}

function setupPlayerNameInput(): void {
    const input = document.querySelector<HTMLInputElement>(SELECTORS.PLAYER_NAME_INPUT);
    if (!input) {
        return;
    }
    
    // Restore saved player name
    const savedName = localStorage.getItem(STORAGE_KEYS.NAV_PLAYER);
    if (savedName) {
        input.value = savedName;
    }
    
    // Save on input
    input.addEventListener('input', () => {
        localStorage.setItem(STORAGE_KEYS.NAV_PLAYER, input.value);
    });
}

// ============================================================================
// Initialization
// ============================================================================

// Global error boundary — routes uncaught async errors to debug logger
globalThis.addEventListener('unhandledrejection', (event) => {
    debugNavigation('Unhandled promise rejection: %O', event.reason);
});

/**
 * Focus a search field and select its text, so typing replaces the old query
 * @param input - Search field to focus
 */
function focusSearchField(input: HTMLInputElement): void {
    input.focus();
    input.select();
}

/**
 * Keyboard accelerators inside a search field for fast probing:
 * the suggestion list gets first pick, then Esc clears the field, ↓ jumps
 * into the results, and Tab in Buying goes straight to Paying (skipping the
 * clear/watchlist/swap buttons).
 * @param event - Keydown event from the search field
 * @param input - The search field
 * @param clearButtonId - ID of the field's clear button
 * @param autocomplete - The field's suggestion list
 */
function handleSearchFieldKeydown(event: KeyboardEvent, input: HTMLInputElement, clearButtonId: string, autocomplete: Autocomplete): void {
    if (event.isComposing || autocomplete.handleKeydown(event)) { return; }

    if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        searchHandler.clearSearchInput(input.id, clearButtonId);
        return;
    }
    if (event.key === 'ArrowDown') {
        const firstRow = document.querySelector<HTMLElement>(`#results .${CSS_CLASSES.TRADE_ROW}`);
        if (!firstRow) { return; }
        event.preventDefault();
        firstRow.focus();
        return;
    }
    const tabTarget = getSearchFieldTabTarget(event, input);
    if (tabTarget) {
        event.preventDefault();
        focusSearchField(getElement<HTMLInputElement>(tabTarget));
    }
}

/**
 * Tab in Buying goes to Paying and Shift+Tab in Paying back to Buying,
 * past the ☆ and ⇄ buttons between them
 * @param event - Keydown in a search field
 * @param input - The search field
 * @returns Id of the field to focus, or undefined for normal tabbing
 */
function getSearchFieldTabTarget(event: KeyboardEvent, input: HTMLInputElement): string | undefined {
    if (event.key !== 'Tab') { return undefined; }
    if (!event.shiftKey && input.id === SEARCH_WANT_ID) { return SEARCH_GIVE_ID; }
    if (event.shiftKey && input.id === SEARCH_GIVE_ID) { return SEARCH_WANT_ID; }
    return undefined;
}

/**
 * Item names for autocomplete, recomputed only when the trade list changes
 * @param kind - "want" for Buying names, "give" for Paying names
 * @returns Unique item names
 */
function getSuggestionNames(kind: 'want' | 'give'): readonly string[] {
    const trades = dataLoader.getAllTrades();
    if (suggestionSource?.trades !== trades) {
        suggestionSource = { trades, names: collectItemNames(trades) };
    }
    return suggestionSource.names[kind];
}

/**
 * Shop and owner suggestions, recomputed only when the trade list changes
 * @returns One suggestion per owner and per named shop
 */
function getShopSuggestions(): readonly ShopSuggestion[] {
    const trades = dataLoader.getAllTrades();
    if (shopSuggestionSource?.trades !== trades) {
        shopSuggestionSource = { trades, suggestions: collectShopSuggestions(trades) };
    }
    return shopSuggestionSource.suggestions;
}

/**
 * Shops with something in stock, for the dots on the map; recomputed only when the trade list changes
 * @returns Shop locations
 */
function getShopLocations(): readonly ShopLocation[] {
    const trades = dataLoader.getAllTrades();
    if (shopLocationSource?.trades !== trades) {
        shopLocationSource = { trades, locations: collectShopLocations(trades) };
    }
    return shopLocationSource.locations;
}

/**
 * Show all trades of one shop: clears the search terms, lenses and filters and sets the shop filter
 * @param filter - Shop or owner to show
 */
function showShopTrades(filter: ShopFilter): void {
    // Leaving the map for the results, not returning to the cart
    mapOpenedFromCart = false;
    document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG)?.close();
    document.querySelector<HTMLDialogElement>(`#${DIALOG_IDS.MATRIX}`)?.close();
    applySearchState({ buy: '', pay: '', scope: { ...EMPTY_SCOPE, shop: filter } }, true);
}

/** Show every new trade: clears the search terms, lenses, shop and other filters and turns on the "New" filter */
function showNewTrades(): void {
    applySearchState({ buy: '', pay: '', scope: { ...EMPTY_SCOPE, filters: { ...EMPTY_SCOPE.filters, newOnly: true } } }, true);
}

/**
 * Put search terms and the search scope into the search UI, e.g. from the URL
 * @param state - Buying/Paying terms and scope
 * @param runSearch - Whether to re-run the search
 */
function applySearchState(state: UrlSearchState, runSearch: boolean): void {
    const wantInput = getElement<HTMLInputElement>(SEARCH_WANT_ID);
    const giveInput = getElement<HTMLInputElement>(SEARCH_GIVE_ID);
    wantInput.value = state.buy;
    giveInput.value = state.pay;
    applyingSearchState = true;
    searchScopeStore.set(state.scope);
    applyingSearchState = false;
    updateClearButtonVisibility(wantInput, CLEAR_SEARCH_WANT_ID);
    updateClearButtonVisibility(giveInput, CLEAR_SEARCH_GIVE_ID);
    wantAutocomplete.close();
    giveAutocomplete.close();
    if (runSearch) { searchHandler.search(); }
}

/** Redraw the pills and open menus, and re-run the search, after the scope changed */
function onScopeChanged(): void {
    const scope = searchScopeStore.get();
    if (scope.buyBiome !== undefined || scope.payBiome !== undefined) { loadBiomes(); }
    scopePills.render();
    wantAutocomplete.refresh();
    giveAutocomplete.refresh();
    if (!applyingSearchState) { searchHandler.search(); }
}

/**
 * Load the biome item rules (once, ADR-021), then redo the open menus, which
 * counted every biome as empty until now, and the search if a biome is in it.
 */
function loadBiomes(): void {
    if (biomesRequested) { return; }
    biomesRequested = true;
    void loadBiomeRules().then(() => {
        wantAutocomplete.refresh();
        giveAutocomplete.refresh();
        const { buyBiome, payBiome } = searchScopeStore.get();
        // Re-rendering the rows would drop the keyboard focus, so only when the results change
        if (buyBiome !== undefined || payBiome !== undefined) { searchHandler.search(); }
    });
}

/** Set up the field menus, scope pills and URL sync (must run before data loads) */
function setupQuickSearch(): void {
    const wantInput = getElement<HTMLInputElement>(SEARCH_WANT_ID);
    const giveInput = getElement<HTMLInputElement>(SEARCH_GIVE_ID);

    const menuDeps: FieldMenuDeps = {
        getShopSuggestions,
        loadBiomes,
        getTrades: () => dataLoader.getAllTrades(),
        getScope: () => searchScopeStore.get(),
        createSearchMatcher: part => searchHandler.createSearchMatcher(part),
        setLens: (side, lens) => { searchScopeStore.setLens(side, lens); },
        setBiome: (side, biome) => { searchScopeStore.setBiome(side, biome); },
        setShop: (shop) => { searchScopeStore.setShop(shop); },
        toggleFilter: (key) => { searchScopeStore.toggleFilter(key); },
        removeLast: (side) => {
            const next = removeLastPill(searchScopeStore.get(), side);
            if (next) { searchScopeStore.set(next); }
            return next !== undefined;
        },
    };
    wantAutocomplete = createAutocomplete(wantInput, () => getSuggestionNames('want'), createFieldMenu('buy', menuDeps));
    giveAutocomplete = createAutocomplete(giveInput, () => getSuggestionNames('give'), createFieldMenu('pay', menuDeps));

    scopePills = createScopePills(getElement('scope-pills'), {
        getScope: () => searchScopeStore.get(),
        setScope: (scope) => { searchScopeStore.set(scope); },
        openMenu: (side, submenuId) => { (side === 'buy' ? wantAutocomplete : giveAutocomplete).openMenu(submenuId); },
        focusField: (side) => { getElement(side === 'buy' ? SEARCH_WANT_ID : SEARCH_GIVE_ID).focus(); },
    });
    searchScopeStore.onChange(onScopeChanged);

    urlSync = createUrlSync({
        getState: () => ({ buy: wantInput.value, pay: giveInput.value, scope: searchScopeStore.get() }),
        applyState: applySearchState,
    });
}

/** Wire up search input fields, clear buttons, and swap button */
function setupSearchInputHandlers(): void {
    const wantInput = getElement<HTMLInputElement>(SEARCH_WANT_ID);
    const giveInput = getElement<HTMLInputElement>(SEARCH_GIVE_ID);

    wantInput.addEventListener('input', () => {
        updateClearButtonVisibility(wantInput, CLEAR_SEARCH_WANT_ID);
        searchHandler.debouncedSearch();
    });
    giveInput.addEventListener('input', () => {
        updateClearButtonVisibility(giveInput, CLEAR_SEARCH_GIVE_ID);
        searchHandler.debouncedSearch();
    });
    wantInput.addEventListener('keydown', (event) => { handleSearchFieldKeydown(event, wantInput, CLEAR_SEARCH_WANT_ID, wantAutocomplete); });
    giveInput.addEventListener('keydown', (event) => { handleSearchFieldKeydown(event, giveInput, CLEAR_SEARCH_GIVE_ID, giveAutocomplete); });
    getElement(CLEAR_SEARCH_WANT_ID).addEventListener('click', () => {
        searchHandler.clearSearchInput(SEARCH_WANT_ID, CLEAR_SEARCH_WANT_ID);
    });
    getElement(CLEAR_SEARCH_GIVE_ID).addEventListener('click', () => {
        searchHandler.clearSearchInput(SEARCH_GIVE_ID, CLEAR_SEARCH_GIVE_ID);
    });
    getElement('swap-search').addEventListener('click', swapSearchFields);
    // Pressing a button in a field leaves the focus where it is, so the field in
    // use (wider on phones) doesn't resize under the pointer before the click lands
    for (const button of document.querySelectorAll('.search-input-wrapper > button')) {
        button.addEventListener('mousedown', (event) => { event.preventDefault(); });
    }
}

/** Swap the Buying and Paying search terms and lenses, and re-run the search */
function swapSearchFields(): void {
    const wantInput = getElement<HTMLInputElement>(SEARCH_WANT_ID);
    const giveInput = getElement<HTMLInputElement>(SEARCH_GIVE_ID);
    const wantValue = wantInput.value;
    wantInput.value = giveInput.value;
    giveInput.value = wantValue;
    updateClearButtonVisibility(wantInput, CLEAR_SEARCH_WANT_ID);
    updateClearButtonVisibility(giveInput, CLEAR_SEARCH_GIVE_ID);
    // Re-runs the search through the scope listener
    searchScopeStore.swapLenses();
}

/**
 * Whether a keystroke target is a text-entry control (where "/" must be typed)
 * @param target - Event target
 * @returns True for inputs, textareas, selects and contenteditable elements
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
}

/**
 * "/" focuses the search from anywhere outside text fields and dialogs
 * @param event - Keydown event
 * @returns True if the event is the "/" shortcut
 */
function isSlashSearchShortcut(event: KeyboardEvent): boolean {
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
    return event.key === '/' && !hasModifier
        && !isTextEntryTarget(event.target) && !document.querySelector('dialog[open]');
}

/** Register global keyboard shortcuts (/ and Ctrl+F search focus, Ctrl+Shift+X swap, Alt+1…4 trade filters) */
function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', event => {
        if (!document.querySelector('dialog[open]') && handleFilterShortcut(event, key => { searchScopeStore.toggleFilter(key); })) {
            event.preventDefault();
            return;
        }
        const searchInput = getElement<HTMLInputElement>(SEARCH_WANT_ID);
        const withCommandKey = event.ctrlKey || event.metaKey;

        // "/" or Ctrl+F / Cmd+F focus the search; a second Ctrl+F falls through to the browser's find
        const isCtrlF = withCommandKey && event.key === 'f' && document.activeElement !== searchInput;
        if (isSlashSearchShortcut(event) || isCtrlF) {
            event.preventDefault();
            focusSearchField(searchInput);
        } else if (withCommandKey && event.shiftKey && event.key === 'X') {
            // Ctrl+Shift+X / Cmd+Shift+X: Swap search fields
            event.preventDefault();
            swapSearchFields();
        }
    });
}

/** Set up all dialog handlers: matrix, dashboard, map, and cart */
function setupAllDialogs(): void {
    // Matrix dialog
    const matrixDialog = getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX);
    setupDialogBackdropClose(matrixDialog);
    getElement('open-matrix').addEventListener('click', () => {
        void openMatrixDialog();
    });

    // Dashboard toggle
    document.querySelector('#open-dashboard')?.addEventListener('click', () => dashboardUI.toggleDashboard());

    // Map dialog
    const mapDialog = document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG);
    if (mapDialog) {
        setupDialogBackdropClose(mapDialog);
    }

    // Cart dialog
    const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
    setupDialogBackdropClose(cartDialog);

    // Clean up zero-quantity items when cart dialog closes
    cartDialog.addEventListener('close', () => {
        cleanupZeroQuantityItems();
    });

    getElement('open-cart').addEventListener('click', () => {
        cartHandler.renderCartDialog();
        restoreActiveTab();
        cartDialog.showModal();
    });
    getElement('close-cart').addEventListener('click', () => {
        // Stop navigation when closing cart dialog
        if (navigationStore.isActive) {
            liveNav.stopNavigation();
        }
        cartDialog.close();
    });
    setupClearCartButton(cartDialog);
}

/** Time the clear-cart button waits for a confirming second click */
const CLEAR_CART_CONFIRM_MS = 4000;

/**
 * Clearing the cart is destructive, so the first click asks for confirmation
 * and only a second click within a few seconds clears it.
 * @param cartDialog - The cart dialog, closed after clearing
 */
function setupClearCartButton(cartDialog: HTMLDialogElement): void {
    const button = getElement<HTMLButtonElement>('clear-cart');
    const label = button.textContent;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const reset = (): void => {
        clearTimeout(resetTimer);
        resetTimer = undefined;
        button.textContent = label;
        button.classList.remove('confirming');
    };

    button.addEventListener('click', () => {
        if (resetTimer === undefined) {
            button.textContent = 'Click again to clear';
            button.classList.add('confirming');
            resetTimer = setTimeout(reset, CLEAR_CART_CONFIRM_MS);
            return;
        }
        reset();
        clearCart();
        refreshCartButtonStates();
        cartDialog.close();
    });
    cartDialog.addEventListener('close', reset);
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize data loader (owns trade state, item values, deviation calculator)
    dataLoader = createDataLoaderHandler({
        getElement,
        renderHeader: () => renderer.renderHeader(),
        search: () => searchHandler.search(),
        showDashboard: () => dashboardUI.showDashboard(),
    });
    void dataLoader.loadShops().then(() => {
        prefetchLeaflet();
        // Biomes are rarely the first thing picked, so their rules can wait for an idle moment
        if ('requestIdleCallback' in globalThis) {
            requestIdleCallback(loadBiomes, { timeout: QUICK_SEARCH.BIOME_PREFETCH_TIMEOUT_MS });
        } else {
            setTimeout(loadBiomes, QUICK_SEARCH.BIOME_PREFETCH_TIMEOUT_MS);
        }
        void loadExchangeRates();
    });

    // Register cart change listener before loading
    cartStore.onChange(updateCartBadge);
    cartStore.load();
    navigationStore.loadProgress();
    navigationStore.loadMode();

    // Initialize search/sort handler (before modules that depend on it)
    searchHandler = createSearchSortHandler({
        getInputValue,
        getElement,
        getAllTrades: () => dataLoader.getAllTrades(),
        getDeviation: () => dataLoader.getDeviation(),
        getNewTradeKeys: () => dataLoader.getNewTradeKeys(),
        renderResults: (...arguments_) => renderer.renderResults(...arguments_),
        updateSortArrows: () => renderer.updateSortArrows(),
        updateDealsBadge: (count) => favoritesUI.updateDealsBadge(count),
        isFilterCartOnly: () => renderer.isFilterCartOnly(),
        getScope: () => searchScopeStore.get(),
        clearLenses: () => { searchScopeStore.clearItemScopes(); },
        onSearched: () => {
            urlSync.record();
        },
    });

    // Initialize favorites
    favoritesStore.load();
    favoritesUI = createFavoritesUIHandler({
        favoritesStore,
        triggerSearch: searchHandler.triggerSearch,
        getItemNames: () => getSuggestionNames('want'),
    });
    favoritesUI.setupFavoritesDialog();
    favoritesUI.updateFavoritesBadge();

    // Initialize dashboard UI
    dashboardUI = createDashboardUIHandler({
        getAllTrades: () => dataLoader.getAllTrades(),
        getDeviation: () => dataLoader.getDeviation(),
        search: () => searchHandler.search(),
        showNewTrades,
        updateClearButtonVisibility,
        snapshotStore,
        favoritesStore,
    });

    // Initialize shop map dialog
    shopMapDialog = createShopMapDialogHandler({
        onCloseFromCart: () => {
            const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
            cartHandler.renderCartDialog();
            cartDialog.showModal();
        },
        isOpenedFromCart: () => mapOpenedFromCart,
        clearOpenedFromCart: () => { mapOpenedFromCart = false; },
        getConfig: () => getConfig(),
        getShopSummary: (x, y, z, world) => summarizeShopAt(dataLoader.getAllTrades(), { x, y, z, world }),
        getOwnerSummary: (player) => summarizeOwner(dataLoader.getAllTrades(), player),
        getShopLocations,
        showShopTrades,
    });

    // Initialize trade renderer
    renderer = createTradeRendererHandler({
        getDeviation: () => dataLoader.getDeviation(),
        getActiveSorts: () => searchHandler.getActiveSorts(),
        getNewTradeKeys: () => dataLoader.getNewTradeKeys(),
        search: () => searchHandler.search(),
        sortByColumn: (col) => searchHandler.sortByColumn(col),
        openDialogForItem: (name) => favoritesUI.openDialogForItem(name),
    });

    // Initialize cart dialog handler
    cartHandler = createCartDialogHandler({
        renderNavigateTab: () => liveNav.renderNavigateTab(),
        recalculateRouteFromPlayer: () => navUpdatesHandler.recalculateRouteFromPlayer(),
        updatePlayerToNextLine: () => navUpdatesHandler.updatePlayerToNextLine(),
        updateLiveDistance: () => navUpdatesHandler.updateLiveDistance(),
        openShopMap: (x, y, z, world) => shopMapDialog.open(x, y, z, world),
        setMapOpenedFromCart: () => { mapOpenedFromCart = true; },
    });

    // Initialize navigation modules
    const updateNearbyShopTooltip = createShopTooltipHandler({
        getRoute: () => navState.currentRoute.length > 0 ? navState.currentRoute : computeRoute(navigationStore.playerPosition, true),
        getActiveCartItemsAtLocation: (x: number, z: number) => cartStore.items.filter(item =>
            item.trade.x === x &&
            item.trade.z === z &&
            !navigationStore.progress.completedKeys.has(getTradeKey(item.trade))
        ),
        getTooltipElement: () => document.querySelector('#nav-shop-tooltip'),
        getPlayerPosition: () => navigationStore.playerPosition
    });

    navMapHandler = createNavMapHandler(navState, {
        navigationStore,
        toggleStopCompletion: (stop, route) => cartHandler.toggleStopCompletion(stop, route),
        onMapDrag: () => liveNav.switchToManualMode(),
    });

    navUpdatesHandler = createNavUpdatesHandler(navState, {
        navigationStore,
        cartStore,
        navMapHandler,
        computeRoute,
        getAllCartStops,
        playerPositionService,
        renderCartDialog: () => cartHandler.renderCartDialog(),
    });

    liveNav = createLiveNavigationHandler(navState, {
        navigationStore,
        navMapHandler,
        navUpdatesHandler,
        computeRoute,
        getAllCartStops,
        syncNavProgressWithCart,
        switchTab,
        getElement,
        playerPositionService,
        updateNearbyShopTooltip,
        createTimelineStop: (...arguments_) => cartHandler.createTimelineStop(...arguments_),
        renderCartDialog: () => cartHandler.renderCartDialog(),
        getConfig: () => getConfig(),
        cartStoreUniqueCount: () => cartStore.uniqueCount,
    });

    setupQuickSearch();
    setupSearchInputHandlers();
    setupKeyboardShortcuts();
    setupAllDialogs();
    setupCartTabs();
    setupPlayerNameInput();
    liveNav.setupNavigationControls();
    setupTradeRowClickHandler();
});

/**
 * Set up event delegation for trade row clicks and keyboard access
 * Handles info icon clicks, map dialog opening, and ignores add-to-cart
 */
function setupTradeRowClickHandler(): void {
    const results = getElement('results');
    results.addEventListener('click', (event) => {
        if (!(event.target instanceof HTMLElement)) { return; }
        const target = event.target;
        const row = target.closest<HTMLElement>(`.${CSS_CLASSES.TRADE_ROW}`);
        if (!row) { return; }

        const x = Number.parseInt(row.dataset.x ?? '0', 10);
        const y = Number.parseInt(row.dataset.y ?? '0', 10);
        const z = Number.parseInt(row.dataset.z ?? '0', 10);
        const world = row.dataset.world ?? WORLDS.OVERWORLD;

        // Click on info icon → open trade details popover
        const infoIcon = target.closest('.info-icon');
        if (infoIcon instanceof HTMLElement) {
            const isResult = infoIcon.dataset.info === 'result';
            openTradeDetailsPopover(row, isResult);
            return;
        }

        // Click on add-to-cart button is handled separately
        if (target.closest('.add-to-cart-btn')) {
            return;
        }

        // Click anywhere else on row → open map dialog
        shopMapDialog.open(x, y, z, world);
    });

    // Keyboard on a focused row: Enter opens the map, arrows move between rows,
    // Esc (or ↑ on the top row) returns to the search field
    results.addEventListener('keydown', (event) => {
        const row = event.target;
        if (!(row instanceof HTMLElement) || !row.classList.contains(CSS_CLASSES.TRADE_ROW)) { return; }

        if (event.key === 'Enter') {
            event.preventDefault();
            row.click();
            return;
        }
        if (event.key === '+') {
            event.preventDefault();
            row.querySelector<HTMLElement>('.add-to-cart-btn')?.click();
            return;
        }
        const target = getRowKeyTarget(row, event.key);
        if (!target) { return; }
        event.preventDefault();
        if (target instanceof HTMLInputElement) {
            focusSearchField(target);
        } else {
            target.focus();
        }
    });
}

/**
 * Where focus should move when a navigation key is pressed on a trade row
 * @param row - The focused trade row
 * @param key - Pressed key
 * @returns The adjacent row, the Buying search field (Esc, or ↑ on the top row), or undefined
 */
function getRowKeyTarget(row: HTMLElement, key: string): HTMLElement | undefined {
    const searchInput = getElement<HTMLInputElement>(SEARCH_WANT_ID);
    const isRow = (element: Element | null): element is HTMLElement =>
        element instanceof HTMLElement && element.classList.contains(CSS_CLASSES.TRADE_ROW);

    if (key === 'Escape') { return searchInput; }
    if (key === 'ArrowDown') { return isRow(row.nextElementSibling) ? row.nextElementSibling : undefined; }
    if (key === 'ArrowUp') { return isRow(row.previousElementSibling) ? row.previousElementSibling : searchInput; }
    return undefined;
}
