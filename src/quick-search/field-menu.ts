/**
 * What the Buying and Paying field menus offer: lenses for that side, shops
 * and owners, and the trade filters that apply to it. Builds the rows the
 * autocomplete shows; the choices go to the search scope (see ADR-023).
 *
 * @module quick-search/field-menu
 */

import { findLens, type Lens, LENSES, type LensId, paysWithLens, rankLenses, receivesFromLens } from '../search/lenses.js';
import { getScopeLens, rankTradeFilters, type SearchScope, type SearchSide, TRADE_FILTERS, type TradeFilterSpec } from '../search/scope.js';
import { formatShopFilter, matchesShopFilter, rankShopSuggestions, type ShopSuggestion } from '../search/shop-filter.js';
import type { QuickFilters, ShopFilter, Trade } from '../types.js';
import type { ActionSuggestion, FieldMenu, MenuEntry, Submenu } from './autocomplete.js';

/** ID of the lens submenu, e.g. to open it from a lens pill */
export const LENS_SUBMENU_ID = 'lenses';
/** ID of the shop submenu, e.g. to open it from a shop pill */
export const SHOP_SUBMENU_ID = 'shops';

/** Lenses, shops and filters listed after the item names while typing */
const MAX_TYPED_LENSES = 2;
const MAX_TYPED_SHOPS = 3;
const MAX_TYPED_FILTERS = 2;

/** Dependencies from the host module */
export interface FieldMenuDeps {
    getTrades: () => readonly Trade[];
    /** Shop and owner suggestions for the current trades */
    getShopSuggestions: () => readonly ShopSuggestion[];
    getScope: () => SearchScope;
    setLens: (side: SearchSide, lens: LensId | undefined) => void;
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
 * Build the menu of one search field.
 * @param side - Buying or Paying
 * @param deps - Host callbacks
 * @returns Field menu for the field's autocomplete
 */
export function createFieldMenu(side: SearchSide, deps: FieldMenuDeps): FieldMenu {
    let countSource: { trades: readonly Trade[]; shop: string; counts: ReadonlyMap<LensId, number> } | undefined;

    /**
     * In-stock trades per lens on this side, within the current shop filter
     * @returns Trade count per lens
     */
    function getLensCounts(): ReadonlyMap<LensId, number> {
        const trades = deps.getTrades();
        const { shop } = deps.getScope();
        if (countSource?.trades === trades && countSource.shop === shopKey(shop)) { return countSource.counts; }

        const matches = side === 'buy' ? receivesFromLens : paysWithLens;
        const counts = new Map<LensId, number>(LENSES.map(lens => [lens.id, 0]));
        for (const trade of trades) {
            if (trade.stock <= 0 || (shop && !matchesShopFilter(trade, shop))) { continue; }
            for (const lens of LENSES) {
                if (matches(trade, lens)) { counts.set(lens.id, (counts.get(lens.id) ?? 0) + 1); }
            }
        }
        countSource = { trades, counts, shop: shopKey(shop) };
        return counts;
    }

    function lensAction(lens: Lens, typed: boolean): MenuEntry {
        const count = getLensCounts().get(lens.id) ?? 0;
        const current = getScopeLens(deps.getScope(), side) === lens.id;
        const action: ActionSuggestion = {
            current,
            icon: lens.icon,
            label: lens.label,
            detail: typed ? `lens · ${plural(count, 'trade')}` : plural(count, 'trade'),
            actionLabel: side === 'buy' ? 'Only buy items from this lens' : 'Only pay with items from this lens',
            tone: 'what',
            empty: count === 0,
            accept: () => { deps.setLens(side, current ? undefined : lens.id); },
        };
        return { kind: 'action', action };
    }

    function shopAction(suggestion: ShopSuggestion): MenuEntry {
        const current = isSameShop(deps.getScope().shop, suggestion.filter);
        const action: ActionSuggestion = {
            current,
            icon: suggestion.kind === 'shop' ? '🏪' : '👤',
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

    const lensSubmenu: Submenu = {
        id: LENS_SUBMENU_ID,
        title: side === 'buy' ? 'Lenses · buying' : 'Lenses · paying with',
        layout: 'grid',
        getEntries: query => (query.trim() ? rankLenses(query, LENSES.length) : LENSES).map(lens => lensAction(lens, false)),
    };

    const shopSubmenu: Submenu = {
        id: SHOP_SUBMENU_ID,
        title: 'Shops & owners',
        layout: 'list',
        getEntries: (query) => {
            const all = deps.getShopSuggestions();
            const shops = query.trim()
                ? rankShopSuggestions(all, query, all.length)
                : all.toSorted((a, b) => b.trades - a.trades || a.label.localeCompare(b.label));
            return shops.map(suggestion => shopAction(suggestion));
        },
    };

    function getRootMenu(): readonly MenuEntry[] {
        const scope = deps.getScope();
        const activeLens = findLens(getScopeLens(scope, side));
        const ownerCount = deps.getShopSuggestions().filter(suggestion => suggestion.kind === 'owner').length;
        return [
            { kind: 'submenu', icon: '◈', label: 'Lenses', detail: activeLens?.label ?? `${LENSES.length}`, tone: 'what', submenu: lensSubmenu },
            {
                kind: 'submenu', icon: '🏪', label: 'Shops & owners',
                detail: scope.shop ? formatShopFilter(scope.shop) : plural(ownerCount, 'owner'),
                tone: 'who', submenu: shopSubmenu,
            },
            { kind: 'heading', label: 'Filters' },
            ...TRADE_FILTERS.filter(spec => spec.sides.includes(side)).map(spec => filterToggle(spec)),
        ];
    }

    function getActions(query: string): readonly MenuEntry[] {
        return [
            ...rankLenses(query, MAX_TYPED_LENSES).map(lens => lensAction(lens, true)),
            ...rankShopSuggestions(deps.getShopSuggestions(), query, MAX_TYPED_SHOPS).map(suggestion => shopAction(suggestion)),
            ...rankTradeFilters(query, side, MAX_TYPED_FILTERS).map(spec => filterToggle(spec)),
        ];
    }

    return { getActions, getRootMenu, removeLast: () => deps.removeLast(side) };
}
