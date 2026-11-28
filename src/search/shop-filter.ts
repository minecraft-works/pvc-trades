/**
 * Pure helpers for limiting results to one shop or one shop owner: matching,
 * autocomplete suggestions, the shop at a map location, and URL state.
 *
 * @module search/shop-filter
 */

import { ADMIN_SHOP_OWNER } from '../constants.js';
import type { ShopFilter, Trade } from '../types.js';
import { textMatchRank } from './query.js';

/** URL query parameter holding the shop owner filter */
const OWNER_PARAM = 'owner';
/** URL query parameter holding the shop name filter */
const SHOP_PARAM = 'shop';

/** The filter that shows every admin shop (`?owner=Server Admins`) */
export const ADMIN_SHOPS_FILTER: ShopFilter = { owner: ADMIN_SHOP_OWNER };

/** Name of the admin shops as a group, in the menu and on its pill */
export const ADMIN_SHOPS_LABEL = 'Admin shops';

/** An autocomplete entry that limits results to a shop or an owner */
export interface ShopSuggestion {
    readonly kind: 'shop' | 'owner';
    readonly filter: ShopFilter;
    /** Shop name or owner name */
    readonly label: string;
    /** e.g. "by .aus3z · 12 trades" or "3 shops · 40 trades" */
    readonly detail: string;
    /** In-stock trades it would show */
    readonly trades: number;
}

/** The shop at one location, for the map dialog */
export interface ShopSummary {
    readonly shopName: string | undefined;
    readonly shopOwner: string | undefined;
    /** Filter showing this shop's trades, when the owner is known */
    readonly filter: ShopFilter | undefined;
    /** In-stock trades that filter shows */
    readonly tradeCount: number;
}

/** A shop location with something in stock, for markers on the map */
export interface ShopLocation {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly world: string;
    readonly shopName: string | undefined;
    readonly shopOwner: string | undefined;
}

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function equalsIgnoreCase(a: string | undefined, b: string | undefined): boolean {
    return a !== undefined && a.toLowerCase() === b?.toLowerCase();
}

/**
 * Whether a trade is in an admin shop: the server's own spawn shops, which
 * sell at fixed prices with unlimited stock.
 *
 * @param trade - Trade to check
 * @returns True for an admin shop
 */
export function isAdminShop(trade: Readonly<Pick<Trade, 'shopOwner'>>): boolean {
    return equalsIgnoreCase(trade.shopOwner, ADMIN_SHOP_OWNER);
}

/**
 * Whether a shop filter shows admin shops: all of them, or one of them.
 *
 * @param filter - Shop filter, if any
 * @returns True if the filter is on the admin owner
 */
export function isAdminFilter(filter: ShopFilter | undefined): boolean {
    return filter !== undefined && equalsIgnoreCase(filter.owner, ADMIN_SHOP_OWNER);
}

/**
 * The stock to rank a trade by. Admin shops report a placeholder (their stock
 * is unlimited), which must not make them look plentiful in a sort or a tie-break.
 *
 * @param trade - Trade
 * @returns Stock shown for the trade, or undefined for an admin shop
 */
export function getRealStock(trade: Readonly<Pick<Trade, 'shopOwner' | 'displayStock'>>): number | undefined {
    return isAdminShop(trade) ? undefined : trade.displayStock;
}

/**
 * Whether a trade belongs to the filtered owner (and shop, if given).
 *
 * @param trade - Trade to check
 * @param filter - Shop filter
 * @returns True if the trade is in the filtered shop(s)
 *
 * @example
 * matchesShopFilter(trade, { owner: '.aus3z', shop: 'End Item Vendor' })
 */
export function matchesShopFilter(trade: Readonly<Pick<Trade, 'shopName' | 'shopOwner'>>, filter: ShopFilter): boolean {
    if (!equalsIgnoreCase(trade.shopOwner, filter.owner)) { return false; }
    return filter.shop === undefined || equalsIgnoreCase(trade.shopName, filter.shop);
}

/**
 * Short label for a shop filter.
 *
 * @param filter - Shop filter
 * @returns "Shop name · owner", or just the owner
 */
export function formatShopFilter(filter: ShopFilter): string {
    return filter.shop ? `${filter.shop} · ${filter.owner}` : filter.owner;
}

function locationKey(trade: Readonly<Trade>): string {
    return `${trade.x},${trade.y},${trade.z},${trade.world}`;
}

/**
 * Build shop and owner suggestions from the in-stock trades (the ones the
 * results can show). Shops without a name are only reachable via their owner.
 *
 * @param trades - All trades
 * @returns One suggestion per owner and per named shop
 */
export function collectShopSuggestions(trades: readonly Trade[]): readonly ShopSuggestion[] {
    const owners = new Map<string, { owner: string; locations: Set<string>; trades: number }>();
    const shops = new Map<string, { owner: string; shop: string; trades: number }>();

    for (const trade of trades) {
        if (trade.stock <= 0 || !trade.shopOwner) { continue; }
        const ownerKey = trade.shopOwner.toLowerCase();
        const ownerEntry = owners.get(ownerKey) ?? { owner: trade.shopOwner, locations: new Set<string>(), trades: 0 };
        ownerEntry.locations.add(locationKey(trade));
        ownerEntry.trades++;
        owners.set(ownerKey, ownerEntry);

        if (trade.shopName) {
            const shopKey = `${ownerKey}\u0000${trade.shopName.toLowerCase()}`;
            const shopEntry = shops.get(shopKey) ?? { owner: trade.shopOwner, shop: trade.shopName, trades: 0 };
            shopEntry.trades++;
            shops.set(shopKey, shopEntry);
        }
    }

    return [
        ...[...owners.values()].map((entry): ShopSuggestion => ({
            kind: 'owner',
            filter: { owner: entry.owner },
            label: entry.owner,
            detail: `${plural(entry.locations.size, 'shop')} · ${plural(entry.trades, 'trade')}`,
            trades: entry.trades,
        })),
        ...[...shops.values()].map((entry): ShopSuggestion => ({
            kind: 'shop',
            filter: { owner: entry.owner, shop: entry.shop },
            label: entry.shop,
            detail: `by ${entry.owner} · ${plural(entry.trades, 'trade')}`,
            trades: entry.trades,
        })),
    ];
}

/**
 * Every shop location with at least one in-stock trade.
 *
 * @param trades - All trades
 * @returns One entry per location, with its name and owner
 */
export function collectShopLocations(trades: readonly Trade[]): readonly ShopLocation[] {
    const locations = new Map<string, ShopLocation>();
    for (const trade of trades) {
        const key = locationKey(trade);
        if (trade.stock > 0 && !locations.has(key)) {
            locations.set(key, { x: trade.x, y: trade.y, z: trade.z, world: trade.world, shopName: trade.shopName, shopOwner: trade.shopOwner });
        }
    }
    return [...locations.values()];
}

/**
 * Pick the shop and owner suggestions that best match typed text.
 *
 * Matches rank like item names (prefix, word start, elsewhere). With an
 * equally good match, players come before shops: a player's name is unique,
 * while many shops share a name like "Valuables". A shop name that several
 * owners use is listed once (the one with the most trades) before any repeats,
 * so a common name can't fill every slot.
 *
 * @param suggestions - From {@link collectShopSuggestions}
 * @param query - Typed text
 * @param limit - Maximum suggestions
 * @returns Best matches
 *
 * @example
 * // 'val' → ValeriaShares (player), Valuables (one of 8), Valuables and Services
 */
export function rankShopSuggestions(suggestions: readonly ShopSuggestion[], query: string, limit: number): readonly ShopSuggestion[] {
    const q = query.trim().toLowerCase();
    if (!q) { return []; }
    const sorted = suggestions
        .map(suggestion => ({ suggestion, rank: textMatchRank(suggestion.label.toLowerCase(), q) }))
        .filter(match => match.rank >= 0)
        .toSorted((a, b) => a.rank - b.rank
            || Number(a.suggestion.kind === 'shop') - Number(b.suggestion.kind === 'shop')
            || a.suggestion.label.length - b.suggestion.label.length
            || b.suggestion.trades - a.suggestion.trades
            || a.suggestion.label.localeCompare(b.suggestion.label))
        .map(match => match.suggestion);

    const seenLabels = new Set<string>();
    const first: ShopSuggestion[] = [];
    const repeats: ShopSuggestion[] = [];
    for (const suggestion of sorted) {
        const label = `${suggestion.kind}:${suggestion.label.toLowerCase()}`;
        (seenLabels.has(label) ? repeats : first).push(suggestion);
        seenLabels.add(label);
    }
    return [...first, ...repeats].slice(0, limit);
}

/**
 * Describe the shop at a location and how many trades its filter would show.
 *
 * @param trades - All trades
 * @param location - Shop location
 * @param location.x - X coordinate
 * @param location.y - Y coordinate
 * @param location.z - Z coordinate
 * @param location.world - World name
 * @returns Shop name, owner, filter and trade count, or undefined if no trade is there
 */
export function summarizeShopAt(
    trades: readonly Trade[],
    location: Readonly<{ x: number; y: number; z: number; world: string }>
): ShopSummary | undefined {
    const isHere = (trade: Readonly<Trade>): boolean =>
        Math.trunc(trade.x) === Math.trunc(location.x)
        && Math.trunc(trade.y) === Math.trunc(location.y)
        && Math.trunc(trade.z) === Math.trunc(location.z)
        && trade.world === location.world;
    const here = trades.find(trade => isHere(trade));
    if (!here) { return undefined; }

    const filter: ShopFilter | undefined = here.shopOwner ? { owner: here.shopOwner, shop: here.shopName } : undefined;
    const tradeCount = filter ? trades.filter(trade => trade.stock > 0 && matchesShopFilter(trade, filter)).length : 0;
    return { shopName: here.shopName, shopOwner: here.shopOwner, filter, tradeCount };
}

/**
 * Describe the shops of an owner (e.g. a player clicked on the map) and how
 * many trades their filter would show.
 *
 * @param trades - All trades
 * @param owner - Player name (case-insensitive)
 * @returns Owner filter and in-stock trade count, or undefined if the player has no shops
 */
export function summarizeOwner(trades: readonly Trade[], owner: string): ShopSummary | undefined {
    const filter: ShopFilter = { owner };
    const owned = trades.filter(trade => matchesShopFilter(trade, filter));
    if (owned.length === 0) { return undefined; }
    return {
        filter,
        shopName: undefined,
        shopOwner: owned[0]?.shopOwner ?? owner,
        tradeCount: owned.filter(trade => trade.stock > 0).length,
    };
}

/**
 * Read the shop filter from a URL query string.
 *
 * @param search - `location.search`, e.g. "?owner=.aus3z&shop=End%20Item%20Vendor"
 * @returns The filter, or undefined without an owner
 */
export function readShopFilter(search: string): ShopFilter | undefined {
    const parameters = new URLSearchParams(search);
    const owner = parameters.get(OWNER_PARAM)?.trim();
    if (!owner) { return undefined; }
    const shop = parameters.get(SHOP_PARAM)?.trim();
    return shop ? { owner, shop } : { owner };
}

/**
 * Build a URL with the shop filter, keeping all other parts.
 *
 * @param href - Current URL
 * @param filter - Shop filter, or undefined to remove it
 * @returns Updated URL string
 */
export function buildShopFilterHref(href: string, filter: ShopFilter | undefined): string {
    const url = new URL(href);
    url.searchParams.delete(OWNER_PARAM);
    url.searchParams.delete(SHOP_PARAM);
    if (filter) {
        url.searchParams.set(OWNER_PARAM, filter.owner);
        if (filter.shop) { url.searchParams.set(SHOP_PARAM, filter.shop); }
    }
    return url.href;
}
