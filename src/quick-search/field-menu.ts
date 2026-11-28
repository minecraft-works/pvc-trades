/**
 * What the Buying and Paying field menus offer. Both open on the same grid
 * of lenses (shown as "Categories"; one per field, picked in place), then
 * the grid of biomes (one per field, on top of the category), each tile with
 * the number of results picking it would show for the current search.
 * Buying also offers shops and owners and the trade filters, which narrow
 * the whole trade; Paying only has lenses and biomes on the cost items. The
 * menu stays while typing: the counts follow the search and shops whose
 * name matches the text join "Sold by". Builds the rows the autocomplete
 * shows; the choices go to the search scope (see ADR-023).
 *
 * @module quick-search/field-menu
 */

import { type Biome, type BiomeId, BIOMES, paysWithBiome, receivesFromBiome } from '../search/biomes.js';
import { type Lens, LENSES, type LensId, paysWithLens, receivesFromLens } from '../search/lenses.js';
import {
    biomePart, getScopeBiome, getScopeLens, type ScopePart, type SearchScope, type SearchSide, TRADE_FILTERS, type TradeFilterSpec,
} from '../search/scope.js';
import { ADMIN_SHOPS_FILTER, ADMIN_SHOPS_LABEL, formatShopFilter, isAdminFilter, isAdminShop, rankShopSuggestions, type ShopSuggestion } from '../search/shop-filter.js';
import type { FilterResult, QuickFilters, ShopFilter, Trade } from '../types.js';
import type { ActionSuggestion, FieldMenu, MenuEntry, Submenu } from './autocomplete.js';

/** ID of the shop submenu, e.g. to open it from a shop pill */
export const SHOP_SUBMENU_ID = 'shops';

/** Shops and owners whose name matches the typed text, listed under "Sold by" */
const MAX_TYPED_SHOPS = 3;

/** Whether the current search lists a trade, see SearchSortHandler.createSearchMatcher */
type SearchMatcher = (trade: Trade) => FilterResult | undefined;

/** What the sellers under "Sold by" would show with the current search */
interface SellerCounts {
    /** Owners with at least one result */
    readonly owners: number;
    /** Admin shop locations with at least one result */
    readonly adminShops: number;
    /** Results in admin shops (items with Best per item) */
    readonly adminResults: number;
}

/** Dependencies from the host module */
export interface FieldMenuDeps {
    getTrades: () => readonly Trade[];
    /** Shop and owner suggestions for the current trades */
    getShopSuggestions: () => readonly ShopSuggestion[];
    getScope: () => SearchScope;
    /** The current search without one part (a field's lens or biome, or the shop filter), to count what picking it would show */
    createSearchMatcher: (leaveOut: ScopePart) => SearchMatcher;
    setLens: (side: SearchSide, lens: LensId | undefined) => void;
    setBiome: (side: SearchSide, biome: BiomeId | undefined) => void;
    /** Make sure the biome item rules load; the host refreshes the menus once they do */
    loadBiomes: () => void;
    setShop: (shop: ShopFilter | undefined) => void;
    toggleFilter: (key: keyof QuickFilters) => void;
    /** Remove the last pill of a field; true if one was removed */
    removeLast: (side: SearchSide) => boolean;
}

function plural(count: number, word: string): string {
    return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
}

function shopKey(shop: ShopFilter | undefined): string {
    return shop ? `${shop.owner.toLowerCase()}\u0000${shop.shop?.toLowerCase() ?? ''}` : '';
}

function isSameShop(a: ShopFilter | undefined, b: ShopFilter): boolean {
    return a !== undefined && shopKey(a) === shopKey(b);
}

/**
 * Sort order for shops and owners: most trades first, then by name
 * @param a - First suggestion
 * @param b - Second suggestion
 * @returns Negative when a comes first
 */
function byTrades(a: ShopSuggestion, b: ShopSuggestion): number {
    return b.trades - a.trades || a.label.localeCompare(b.label);
}

/**
 * How many results each lens or biome of one field would show with the
 * current search. Best per item keeps one trade per item name, so then item
 * names are counted.
 * @param options - What to count
 * @param options.trades - All trades
 * @param options.match - The current search without this field's lens (or biome)
 * @param options.perItem - Whether Best per item is on
 * @param options.ids - Lenses or biomes to count
 * @param options.isIn - Whether a trade is in one of them, on this field's side
 * @returns Result count per lens or biome
 */
function countPerOption<Id extends string>(options: {
    trades: readonly Trade[];
    match: SearchMatcher;
    perItem: boolean;
    ids: readonly Id[];
    isIn: (trade: Trade, id: Id) => boolean;
}): ReadonlyMap<Id, number> {
    const { trades, match, perItem, ids, isIn } = options;
    const found = new Map<Id, Set<string>>(ids.map(id => [id, new Set<string>()]));
    for (const [index, trade] of trades.entries()) {
        const result = match(trade);
        if (!result) { continue; }
        const key = perItem ? result.displayName.toLowerCase() : String(index);
        for (const id of ids) {
            if (isIn(trade, id)) { found.get(id)?.add(key); }
        }
    }
    return new Map([...found].map(([id, keys]) => [id, keys.size]));
}

const LENS_BY_ID: ReadonlyMap<LensId, Lens> = new Map(LENSES.map(lens => [lens.id, lens]));
const BIOME_BY_ID: ReadonlyMap<BiomeId, Biome> = new Map(BIOMES.map(biome => [biome.id, biome]));

/**
 * Categories and biomes in the menu are listed by name, so a long grid is easy to scan
 * @param a - First option
 * @param a.label - Its name
 * @param b - Second option
 * @param b.label - Its name
 * @returns Negative when a comes first
 */
function byLabel(a: { readonly label: string }, b: { readonly label: string }): number {
    return a.label.localeCompare(b.label);
}
const MENU_LENSES: readonly Lens[] = LENSES.toSorted(byLabel);
const MENU_BIOMES: readonly Biome[] = BIOMES.toSorted(byLabel);

/**
 * Whether a trade is in a lens on one field's side
 * @param side - Buying (received item) or Paying (cost items)
 * @returns Check for a trade and a lens ID
 */
function lensCheck(side: SearchSide): (trade: Trade, id: LensId) => boolean {
    const isIn = side === 'buy' ? receivesFromLens : paysWithLens;
    return (trade, id) => {
        const lens = LENS_BY_ID.get(id);
        return lens !== undefined && isIn(trade, lens);
    };
}

/**
 * Whether a trade is in a biome on one field's side
 * @param side - Buying (received item) or Paying (cost items)
 * @returns Check for a trade and a biome ID
 */
function biomeCheck(side: SearchSide): (trade: Trade, id: BiomeId) => boolean {
    const isIn = side === 'buy' ? receivesFromBiome : paysWithBiome;
    return (trade, id) => {
        const biome = BIOME_BY_ID.get(id);
        return biome !== undefined && isIn(trade, biome);
    };
}

/**
 * How many results the sellers under "Sold by" would show with the current
 * search (shop filter left out): owners with results, and the admin shops.
 * Best per item counts items, like the lens counts.
 * @param options - What to count
 * @param options.trades - All trades
 * @param options.match - The current search without the shop filter
 * @param options.perItem - Whether Best per item is on
 * @returns Seller counts
 */
function countSellers(options: { trades: readonly Trade[]; match: SearchMatcher; perItem: boolean }): SellerCounts {
    const { trades, match, perItem } = options;
    const owners = new Set<string>();
    const adminLocations = new Set<string>();
    const adminResults = new Set<string>();
    for (const [index, trade] of trades.entries()) {
        const result = match(trade);
        if (result && trade.shopOwner) { owners.add(trade.shopOwner.toLowerCase()); }
        if (result && isAdminShop(trade)) {
            adminLocations.add(`${trade.x},${trade.y},${trade.z},${trade.world}`);
            adminResults.add(perItem ? result.displayName.toLowerCase() : String(index));
        }
    }
    return { owners: owners.size, adminShops: adminLocations.size, adminResults: adminResults.size };
}

/**
 * Build the menu of one search field.
 * @param side - Buying or Paying
 * @param deps - Host callbacks
 * @returns Field menu for the field's autocomplete
 */
export function createFieldMenu(side: SearchSide, deps: FieldMenuDeps): FieldMenu {
    function lensAction(lens: Lens, count: number): MenuEntry {
        const current = getScopeLens(deps.getScope(), side) === lens.id;
        const action: ActionSuggestion = {
            current,
            label: lens.label,
            detail: count.toLocaleString(),
            spokenDetail: plural(count, 'trade'),
            actionLabel: side === 'buy' ? 'Only buy items in this category' : 'Only pay with items in this category',
            tone: 'what',
            empty: count === 0,
            // Like the filters: picking a category keeps the menu and the search, so a filter can be ticked next
            keepOpen: true,
            accept: () => { deps.setLens(side, current ? undefined : lens.id); },
        };
        return { kind: 'action', action };
    }

    /**
     * A biome tile in the Biomes section, picked in place like a category
     * @param biome - Biome
     * @param count - Results picking it would show
     * @returns Menu row
     */
    function biomeAction(biome: Biome, count: number): MenuEntry {
        const current = getScopeBiome(deps.getScope(), side) === biome.id;
        const action: ActionSuggestion = {
            current,
            label: biome.label,
            detail: count.toLocaleString(),
            spokenDetail: plural(count, 'trade'),
            actionLabel: side === 'buy' ? 'Only buy items from this biome' : 'Only pay with items from this biome',
            tone: 'what',
            empty: count === 0,
            keepOpen: true,
            accept: () => { deps.setBiome(side, current ? undefined : biome.id); },
        };
        return { kind: 'action', action };
    }

    /**
     * The Biomes section: every biome with the number of results picking it would show
     * @returns Menu rows
     */
    function getBiomeRows(): readonly MenuEntry[] {
        deps.loadBiomes();
        const counts = countPerOption({
            trades: deps.getTrades(), match: deps.createSearchMatcher(biomePart(side)), perItem: deps.getScope().filters.bestPerItem,
            ids: BIOMES.map(biome => biome.id), isIn: biomeCheck(side),
        });
        return [
            { kind: 'heading', label: 'Biomes', section: 'biomes' },
            ...MENU_BIOMES.map(biome => biomeAction(biome, counts.get(biome.id) ?? 0)),
        ];
    }

    function shopAction(suggestion: ShopSuggestion): MenuEntry {
        const current = isSameShop(deps.getScope().shop, suggestion.filter);
        const action: ActionSuggestion = {
            current,
            label: suggestion.label,
            detail: suggestion.detail,
            actionLabel: suggestion.kind === 'shop' ? 'Show only this shop' : 'Show only shops of this player',
            tone: 'who',
            accept: () => { deps.setShop(current ? undefined : suggestion.filter); },
        };
        return { kind: 'action', action };
    }

    function filterToggle(spec: TradeFilterSpec): MenuEntry {
        const shortcut = TRADE_FILTERS.indexOf(spec) + 1;
        return {
            kind: 'toggle',
            label: spec.menuLabel,
            detail: `Alt+${shortcut}`,
            title: spec.title,
            checked: deps.getScope().filters[spec.key],
            toggle: () => { deps.toggleFilter(spec.key); },
        };
    }

    /**
     * The pinned "Admin shops" row: the server's own shops as one group,
     * picked in place like a category
     * @param counts - What the sellers would show with the current search
     * @returns Menu row
     */
    function adminAction(counts: SellerCounts): MenuEntry {
        const { shop, filters } = deps.getScope();
        const current = isAdminFilter(shop) && shop?.shop === undefined;
        const results = plural(counts.adminResults, filters.bestPerItem ? 'item' : 'trade');
        const action: ActionSuggestion = {
            current,
            label: ADMIN_SHOPS_LABEL,
            detail: `${plural(counts.adminShops, 'shop')} · ${results}`,
            actionLabel: 'Show only the admin shops',
            tone: 'who',
            empty: counts.adminResults === 0,
            keepOpen: true,
            accept: () => { deps.setShop(current ? undefined : ADMIN_SHOPS_FILTER); },
        };
        return { kind: 'action', action };
    }

    /**
     * The "Sold by" rows: Admin shops (when the data has them), shops whose
     * name matches the typed text, and the list of all shops and owners.
     * The counts follow the current search, like the category counts.
     * @param typed - Text typed in the field
     * @param counts - What the sellers would show with the current search
     * @returns Menu rows under "Sold by"
     */
    function getSoldBy(typed: string, counts: SellerCounts): readonly MenuEntry[] {
        const { shop } = deps.getScope();
        const all = deps.getShopSuggestions();
        const admin = all.find(suggestion => suggestion.kind === 'owner' && isAdminFilter(suggestion.filter));
        const typedShops = rankShopSuggestions(all, typed, MAX_TYPED_SHOPS).filter(suggestion => suggestion !== admin);
        return [
            ...(admin ? [adminAction(counts)] : []),
            ...typedShops.map(suggestion => shopAction(suggestion)),
            {
                kind: 'submenu', label: 'Shops & owners',
                detail: shop ? formatShopFilter(shop) : plural(counts.owners, 'owner'),
                tone: 'who', submenu: shopSubmenu,
            },
        ];
    }

    const shopSubmenu: Submenu = {
        id: SHOP_SUBMENU_ID,
        title: 'Shops & owners',
        layout: 'list',
        getEntries: (query) => {
            const all = deps.getShopSuggestions();
            const shops = query.trim()
                ? rankShopSuggestions(all, query, all.length)
                : all.toSorted(byTrades);
            return shops.map(suggestion => shopAction(suggestion));
        },
    };

    /**
     * The field's menu: its categories and (Buying) shops and filters
     * @param typed - Text typed in the field; shops whose name matches it join "Sold by"
     * @returns Menu rows
     */
    function getMenu(typed: string): readonly MenuEntry[] {
        const scope = deps.getScope();
        const counts = countPerOption({
            trades: deps.getTrades(), match: deps.createSearchMatcher(side), perItem: scope.filters.bestPerItem,
            ids: LENSES.map(lens => lens.id), isIn: lensCheck(side),
        });
        // Both fields open on their categories, so the two menus start the same way
        const lenses: readonly MenuEntry[] = [
            { kind: 'heading', label: 'Categories', section: 'categories' },
            ...MENU_LENSES.map(lens => lensAction(lens, counts.get(lens.id) ?? 0)),
            ...getBiomeRows(),
        ];
        if (side === 'pay') { return lenses; }
        return [
            ...lenses,
            { kind: 'heading', label: 'Sold by', section: 'sellers' },
            ...getSoldBy(typed, countSellers({ trades: deps.getTrades(), match: deps.createSearchMatcher('shop'), perItem: scope.filters.bestPerItem })),
            { kind: 'heading', label: 'Filters', section: 'filters' },
            ...TRADE_FILTERS.map(spec => filterToggle(spec)),
        ];
    }

    return {
        getActions: query => getMenu(query),
        getRootMenu: () => getMenu(''),
        rootLayout: 'grid',
        removeLast: () => deps.removeLast(side),
    };
}
