/**
 * Shop Tooltip - Proximity-based shop info display
 * 
 * Shows a shopping list tooltip when the player enters a shop area
 * during live navigation. Auto-hides after 4 seconds.
 * 
 * @module navigation/shop-tooltip
 */

import { calculateRouteDistance } from '../library.js';
import type { PlayerPosition } from '../stores/navigation-store.js';
import type { CartItem,RouteStop } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

/** Distance threshold to show shop tooltip (in blocks) */
const SHOP_NEARBY_THRESHOLD = 100;

/** Auto-hide delay for tooltip (in milliseconds) */
const AUTO_HIDE_DELAY_MS = 4000;

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies for the shop tooltip handler
 */
export interface ShopTooltipDependencies {
    /** Get the current navigation route */
    getRoute: () => RouteStop[];
    /** Get cart items at a specific location that aren't completed */
    getActiveCartItemsAtLocation: (x: number, z: number) => CartItem[];
    /** Get the tooltip DOM element */
    getTooltipElement: () => Element | null;
    /** Get the current player position (undefined if not tracking) */
    getPlayerPosition: () => PlayerPosition | undefined;
}

/**
 * Result of finding the nearest shop
 */
interface NearestShopResult {
    shop: RouteStop;
    distance: number;
    shopKey: string;
}

// ============================================================================
// Helper Functions (module level for unicorn/consistent-function-scoping)
// ============================================================================

/**
 * Find the nearest shop within threshold distance
 * @param playerPosition - Current player position with x, z, and world
 * @param route - Array of route stops for the current navigation
 * @returns Nearest shop result with distance and key, or undefined if none within threshold
 */
function findNearestShop(
    playerPosition: PlayerPosition,
    route: RouteStop[]
): NearestShopResult | undefined {
    let nearestShop: RouteStop | undefined;
    let nearestDistance = Infinity;

    for (const stop of route) {
        if (!stop.cartItem) { continue; }

        const distance = calculateRouteDistance(
            playerPosition.x, playerPosition.z, playerPosition.world,
            stop.x, stop.z, stop.world
        );

        if (distance < SHOP_NEARBY_THRESHOLD && distance < nearestDistance) {
            nearestDistance = distance;
            nearestShop = stop;
        }
    }

    if (!nearestShop) {
        return undefined;
    }

    return {
        shop: nearestShop,
        distance: nearestDistance,
        shopKey: `${nearestShop.x},${nearestShop.z}`
    };
}

/**
 * Render the shopping list tooltip HTML
 * @param items - Shopping cart items to render in the tooltip
 * @returns HTML string for the tooltip content
 */
function renderTooltipContent(items: CartItem[]): string {
    const itemsHtml = items.map(cartItem =>
        `<li><span class="item-name">${cartItem.trade.resultName}</span><span class="item-qty">×${cartItem.quantity}</span></li>`
    ).join('');

    return `
        <h4>🛒 Shopping List</h4>
        <ul>${itemsHtml}</ul>
    `;
}

// ============================================================================
// Shop Tooltip Handler
// ============================================================================

/**
 * Create a shop tooltip handler with internal state.
 * 
 * The handler tracks which shop is currently shown to prevent
 * re-showing the tooltip when the player is still in the same area.
 * 
 * @param dependencies - Functions to access external state
 * @returns Function to update the tooltip based on player position
 * 
 * @example
 * ```typescript
 * const updateTooltip = createShopTooltipHandler({
 *     getRoute: () => currentRoute,
 *     getActiveCartItemsAtLocation: (x, z) => cartStore.items.filter(...),
 *     getTooltipElement: () => document.querySelector('#nav-shop-tooltip'),
 *     getPlayerPosition: () => navigationStore.playerPosition
 * });
 * 
 * // Call on each player position update
 * updateTooltip();
 * ```
 */
export function createShopTooltipHandler(
    dependencies: ShopTooltipDependencies
): () => void {
    // Internal state
    let currentNearbyShopKey: string | undefined;
    let shopTooltipTimeout: ReturnType<typeof setTimeout> | undefined;

    /**
     * Show the tooltip with auto-hide timer
     * (Closure-bound to access shopTooltipTimeout state)
     * @param tooltip - The tooltip element to display
     * @param items - Cart items to render inside the tooltip
     */
    function showTooltip(tooltip: Element, items: CartItem[]): void {
        tooltip.innerHTML = renderTooltipContent(items);
        tooltip.classList.remove('hidden');

        // Clear existing timer
        if (shopTooltipTimeout) {
            clearTimeout(shopTooltipTimeout);
        }

        // Auto-hide after delay
        shopTooltipTimeout = setTimeout(() => {
            tooltip.classList.add('hidden');
        }, AUTO_HIDE_DELAY_MS);
    }

    /**
     * Update the shop tooltip based on current player position
     */
    return function updateNearbyShopTooltip(): void {
        const tooltip = dependencies.getTooltipElement();
        const playerPosition = dependencies.getPlayerPosition();

        if (!tooltip || !playerPosition) {
            return;
        }

        const route = dependencies.getRoute();
        const nearestResult = findNearestShop(playerPosition, route);

        if (nearestResult?.shop.cartItem) {
            const { shop, shopKey } = nearestResult;

            // Only show tooltip when ENTERING a new shop area
            if (currentNearbyShopKey !== shopKey) {
                currentNearbyShopKey = shopKey;

                const itemsAtShop = dependencies.getActiveCartItemsAtLocation(shop.x, shop.z);
                showTooltip(tooltip, itemsAtShop);
            }
        } else {
            // Left all shop areas
            currentNearbyShopKey = undefined;
        }
    };
}
