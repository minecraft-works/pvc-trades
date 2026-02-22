/**
 * Cart dialog rendering, route computation, and cart helper functions.
 *
 * Pure functions (computeRoute, getAllCartStops, etc.) are exported directly.
 * UI functions that need late-bound dependencies (renderCartDialog,
 * toggleStopCompletion, createTimelineStop) are exposed via factory.
 *
 * @module cart/cart-dialog
 */

import { CSS_CLASSES, DIALOG_IDS } from '../constants.js';
import {
    aggregateShoppingList,
    computeOptimalOrder,
    getTradeKey,
    isNether,
    toOverworldEquivalent,
} from '../library.js';
import { cartStore, navigationStore } from '../stores/index.js';
import type { RouteStop, ShoppingList,Trade } from '../types.js';

// ============================================================================
// Local DOM helper
// ============================================================================

/** @internal */
function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.querySelector<T>(`#${id}`);
    if (!element) { throw new Error(`Element #${id} not found`); }
    return element;
}

// ============================================================================
// Route computation (pure – no late-bound deps)
// ============================================================================

/** Origin point for route optimization */
export interface RouteOrigin {
    x: number;
    z: number;
    world: string;
}

/**
 * Compute optimal route using nearest-neighbor + 2-opt optimization
 *
 * @param origin - Optional starting position (defaults to 0,0 in overworld)
 * @param excludeCompleted - If true, exclude items marked as collected
 */
export function computeRoute(origin?: RouteOrigin, excludeCompleted = false): RouteStop[] {
    if (cartStore.isEmpty) { return []; }

    // Filter cart items: exclude qty=0 and optionally completed items
    let activeItems = cartStore.items.filter(item => item.quantity > 0);
    if (excludeCompleted) {
        activeItems = activeItems.filter(item => !navigationStore.progress.completedKeys.has(getTradeKey(item.trade)));
    }

    if (activeItems.length === 0) { return []; }

    // Convert cart items to RoutePoints for optimization
    const points = activeItems.map(item => ({
        x: item.trade.x,
        z: item.trade.z,
        world: item.trade.world,
    }));

    // Get optimized order using lib functions, passing origin if provided
    const order = computeOptimalOrder(points, origin);

    // Build route with shop stops only
    const route: RouteStop[] = [];

    for (const index of order) {
        const item = activeItems[index]!;
        const stopIsNether = isNether(item.trade.world);
        const displayCoords = toOverworldEquivalent(item.trade.x, item.trade.z, item.trade.world);
        route.push({
            type: 'shop',
            x: item.trade.x,
            y: item.trade.y,
            z: item.trade.z,
            world: item.trade.world,
            displayX: displayCoords.x,
            displayZ: displayCoords.z,
            isNether: stopIsNether,
            cartItem: item,
        });
    }

    return route;
}

/**
 * Get all cart items as RouteStops (for display purposes – includes completed items).
 * Completed items are included but can be identified via navProgress.completedKeys.
 */
export function getAllCartStops(): RouteStop[] {
    const activeItems = cartStore.items.filter(item => item.quantity > 0);

    return activeItems.map(item => {
        const stopIsNether = isNether(item.trade.world);
        const displayCoords = toOverworldEquivalent(item.trade.x, item.trade.z, item.trade.world);
        return {
            type: 'shop' as const,
            x: item.trade.x,
            y: item.trade.y,
            z: item.trade.z,
            world: item.trade.world,
            displayX: displayCoords.x,
            displayZ: displayCoords.z,
            isNether: stopIsNether,
            cartItem: item,
        };
    });
}

// ============================================================================
// Cart helper functions (no late-bound deps)
// ============================================================================

/** Aggregate cart into shopping lists */
function getShoppingList(): ShoppingList {
    return aggregateShoppingList(cartStore.items);
}

/** Update the cart badge count */
export function updateCartBadge(): void {
    const badge = document.querySelector('#cart-badge');
    if (badge) {
        const count = cartStore.totalQuantity;
        badge.textContent = count > 0 ? String(count) : '';
        badge.classList.toggle('hidden', count === 0);
    }
}

/**
 * Refresh the in-cart state of all visible cart buttons.
 * Call this after cart modifications (remove, clear) to update button styling.
 */
export function refreshCartButtonStates(): void {
    const buttons = document.querySelectorAll<HTMLElement>('.add-to-cart-btn[data-trade-key]');
    const cartKeys = new Set(cartStore.items.map(item => getTradeKey(item.trade)));

    for (const button of buttons) {
        const key = button.dataset.tradeKey;
        if (key) {
            button.classList.toggle('in-cart', cartKeys.has(key));
        }
    }
}

/**
 * Remove items with zero quantity from cart.
 * Called when cart dialog is closed.
 */
export function cleanupZeroQuantityItems(): void {
    if (cartStore.cleanupZeroQuantity()) {
        refreshCartButtonStates();
    }
}

/** Clear the entire cart and reset navigation progress */
export function clearCart(): void {
    cartStore.clear();
    navigationStore.resetProgress();
}

/**
 * Sync navigation progress with current cart.
 * Removes completed keys for items no longer in cart, recalculates current index.
 */
export function syncNavProgressWithCart(route: RouteStop[]): void {
    // Get keys of all shop stops in current route
    const currentShopKeys = new Set(
        route
            .filter(stop => stop.type === 'shop' && stop.cartItem)
            .map(stop => getTradeKey(stop.cartItem!.trade)),
    );

    // Get currently completed keys that are still valid
    const validCompleted = new Set(
        [...navigationStore.progress.completedKeys].filter(key => currentShopKeys.has(key)),
    );

    // Find first non-completed shop stop index
    let currentIndex = 0;
    for (let index = 0; index < route.length; index++) {
        const stop = route[index];
        if (stop?.type === 'shop' && stop.cartItem) {
            const key = getTradeKey(stop.cartItem.trade);
            if (!validCompleted.has(key)) {
                currentIndex = index;
                break;
            }
        }
        // If we reach the end, all are completed
        if (index === route.length - 1) {
            currentIndex = route.length;
        }
    }

    // Update store with synced progress
    navigationStore.syncProgress(validCompleted, currentIndex);
}

// ============================================================================
// Stop status helper (pure)
// ============================================================================

/** Get status for a route stop based on navigation progress */
function getStopStatus(stop: RouteStop, stopIndex: number, _route: RouteStop[]): 'completed' | 'current' | 'pending' {
    if (stop.type === 'portal') {
        if (stopIndex < navigationStore.progress.currentIndex) { return 'completed'; }
        if (stopIndex === navigationStore.progress.currentIndex) { return 'current'; }
        return 'pending';
    }

    if (stop.type === 'shop' && stop.cartItem) {
        const key = getTradeKey(stop.cartItem.trade);
        if (navigationStore.progress.completedKeys.has(key)) { return 'completed'; }
        if (stopIndex === navigationStore.progress.currentIndex) { return 'current'; }
    }

    return 'pending';
}

// ============================================================================
// Factory deps & handler types
// ============================================================================

/** Late-bound dependencies for cart dialog UI */
export interface CartDialogDeps {
    /** Re-render navigate tab after stop completion toggle */
    renderNavigateTab: () => void;
    /** Recalculate route from player position */
    recalculateRouteFromPlayer: () => void;
    /** Update player-to-next line on map */
    updatePlayerToNextLine: () => void;
    /** Update live distance display */
    updateLiveDistance: () => void;
    /** Open shop map dialog for a location */
    openShopMap: (x: number, y: number, z: number, world: string) => void;
    /** Set the mapOpenedFromCart flag in main.ts */
    setMapOpenedFromCart: () => void;
}

/** Public API returned by createCartDialogHandler */
export interface CartDialogHandler {
    /** Render the cart dialog contents */
    renderCartDialog: () => void;
    /** Toggle completion status of a route stop */
    toggleStopCompletion: (stop: RouteStop, route: RouteStop[]) => void;
    /** Create a timeline stop element */
    createTimelineStop: (
        stop: RouteStop,
        stopIndex: number,
        route: RouteStop[],
        previousStop: RouteStop | undefined,
        forNavPanel?: boolean,
    ) => HTMLElement;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create the cart dialog handler.
 *
 * @param deps Late-bound callbacks from main.ts
 */
// eslint-disable-next-line max-lines-per-function -- factory function encapsulates module state via closures
export function createCartDialogHandler(deps: CartDialogDeps): CartDialogHandler {

    // ── Cart item element ───────────────────────────────────────────

    function createCartItemElement(trade: Trade, quantity: number): HTMLElement {
        const itemElement = document.createElement('div');
        itemElement.className = 'cart-item';

        if (quantity === 0) {
            itemElement.classList.add('zero-quantity');
        }

        itemElement.innerHTML = `
            <span class="cart-item-info">
                <strong>${trade.resultAmount}× ${trade.resultName}</strong>
                <span class="cart-item-cost">← ${trade.item1.amount}× ${trade.costName}</span>
            </span>
            <span class="cart-item-controls">
                <button class="qty-btn qty-minus" aria-label="Decrease quantity">−</button>
                <span class="qty-display">${quantity}</span>
                <button class="qty-btn qty-plus" aria-label="Increase quantity">+</button>
                <button class="remove-btn" aria-label="Remove from cart">×</button>
            </span>
        `;

        const minusButton = itemElement.querySelector('.qty-minus')!;
        const plusButton = itemElement.querySelector('.qty-plus')!;
        const removeButton = itemElement.querySelector('.remove-btn')!;

        minusButton.addEventListener('click', () => {
            if (quantity > 0) {
                cartStore.updateQuantity(trade, -1);
                renderCartDialog();
            }
        });

        plusButton.addEventListener('click', () => {
            cartStore.updateQuantity(trade, 1);
            renderCartDialog();
        });

        removeButton.addEventListener('click', () => {
            cartStore.remove(trade);
            refreshCartButtonStates();
            renderCartDialog();
        });

        return itemElement;
    }

    // ── Toggle completion ───────────────────────────────────────────

    function toggleStopCompletion(stop: RouteStop, route: RouteStop[]): void {
        if (stop.type !== 'shop' || !stop.cartItem) { return; }

        const key = getTradeKey(stop.cartItem.trade);

        if (navigationStore.progress.completedKeys.has(key)) {
            navigationStore.unmarkStopComplete(key);
        } else {
            navigationStore.markStopComplete(key);
        }

        syncNavProgressWithCart(route);

        renderCartDialog();
        deps.renderNavigateTab();

        if (navigationStore.isActive && navigationStore.playerPosition) {
            deps.recalculateRouteFromPlayer();
            deps.updatePlayerToNextLine();
            deps.updateLiveDistance();
        }
    }

    // ── Timeline stop ───────────────────────────────────────────────

    /**
     * Create a timeline stop element – compact single-line style.
     *
     * @param forNavPanel If true, hide coordinates (shown on map instead)
     */
    function createTimelineStop(
        stop: RouteStop,
        stopIndex: number,
        route: RouteStop[],
        _previousStop: RouteStop | undefined,
        forNavPanel = false,
    ): HTMLElement {
        const status = getStopStatus(stop, stopIndex, route);

        const element = document.createElement('div');
        const netherClass = isNether(stop.world) ? ' timeline-stop-nether' : '';
        element.className = `timeline-stop timeline-stop-${stop.type}${netherClass} timeline-status-${status}`;

        // Connector column (dot + line)
        const connector = document.createElement('div');
        connector.className = 'timeline-connector';

        const dot = document.createElement('button');
        dot.className = 'timeline-dot';
        dot.setAttribute('aria-label', status === 'completed' ? 'Mark incomplete' : 'Mark complete');
        dot.innerHTML = status === 'completed' ? '✓' : '';

        if (stop.type === 'shop') {
            dot.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleStopCompletion(stop, route);
            });
        }

        connector.append(dot);

        const line = document.createElement('div');
        line.className = 'timeline-line';
        connector.append(line);

        element.append(connector);

        // Content
        const content = document.createElement('div');
        content.className = 'timeline-content';

        const item = stop.cartItem!;
        const isNetherShop = isNether(stop.world);

        let owCoords: string;
        let netherCoords: string;
        if (isNetherShop) {
            netherCoords = `${stop.x}, ${stop.z}`;
            owCoords = `${stop.x * 8}, ${stop.z * 8}`;
        } else {
            owCoords = `${stop.x}, ${stop.z}`;
            netherCoords = `${Math.round(stop.x / 8)}, ${Math.round(stop.z / 8)}`;
        }

        content.innerHTML = forNavPanel
            ? `<span class="stop-text">${item.quantity}× ${item.trade.resultName}</span>`
            : `<span class="stop-text">${item.quantity}× ${item.trade.resultName}</span><span class="coord-ow">${owCoords}</span><span class="coord-nether">${netherCoords}</span>`;

        content.classList.add('clickable');
        content.addEventListener('click', () => {
            if (navigationStore.isActive) {
                toggleStopCompletion(stop, route);
            } else {
                deps.setMapOpenedFromCart();
                const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
                cartDialog.close();
                deps.openShopMap(stop.x, item.trade.y, stop.z, stop.world);
            }
        });

        element.append(content);

        return element;
    }

    // ── Render cart dialog ──────────────────────────────────────────

    function renderCartDialog(): void {
        const itemsContainer = getElement('cart-items');
        const costsContainer = getElement('cart-costs');
        const gainsContainer = getElement('cart-gains');
        const clearCartButton = getElement('clear-cart');
        const isCartTabActive = document.querySelector('#tab-cart')?.classList.contains('active') ?? true;

        itemsContainer.innerHTML = '';
        costsContainer.innerHTML = '';
        gainsContainer.innerHTML = '';

        if (cartStore.isEmpty) {
            itemsContainer.innerHTML = `<p class="${CSS_CLASSES.CART_EMPTY}">Your cart is empty</p>`;
            clearCartButton.classList.add('hidden');
            return;
        }

        if (isCartTabActive) {
            clearCartButton.classList.remove('hidden');
        }

        for (const cartItem of cartStore.items) {
            itemsContainer.append(createCartItemElement(cartItem.trade, cartItem.quantity));
        }

        const shoppingList = getShoppingList();

        for (const [name, amount] of shoppingList.costs) {
            const li = document.createElement('li');
            li.textContent = `${amount}× ${name}`;
            costsContainer.append(li);
        }

        for (const [name, amount] of shoppingList.gains) {
            const li = document.createElement('li');
            li.textContent = `${amount}× ${name}`;
            gainsContainer.append(li);
        }
    }

    // ── Public API ──────────────────────────────────────────────────

    return {
        renderCartDialog,
        toggleStopCompletion,
        createTimelineStop,
    };
}
