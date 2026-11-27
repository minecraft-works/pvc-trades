/**
 * Keeps the Buying/Paying search and the shop filter in the URL
 * (`?buy=…&pay=…&owner=…&shop=…`), so probes can be bookmarked or shared
 * and Back/Forward step between earlier probes.
 *
 * While typing, the current history entry is updated in place; once a search
 * has been unchanged for a moment it is "settled" and the next change starts
 * a new history entry.
 *
 * @module quick-search/url-sync
 */

import { QUICK_SEARCH } from '../constants.js';
import { buildSearchHref, readSearchTerms } from '../search/query.js';
import { buildShopFilterHref, readShopFilter } from '../search/shop-filter.js';
import type { ShopFilter } from '../types.js';

/** Search state kept in the URL */
export interface UrlSearchState {
    readonly buy: string;
    readonly pay: string;
    readonly shop: ShopFilter | undefined;
}

/** Dependencies from the host module */
export interface UrlSyncDeps {
    /** Current raw search terms and shop filter */
    getState: () => UrlSearchState;
    /** Put the state into the search fields; `runSearch` re-runs the search */
    applyState: (state: UrlSearchState, runSearch: boolean) => void;
}

/** Public API */
export interface UrlSync {
    /** Record the current search terms in the URL (call after each search) */
    record: () => void;
}

function readState(search: string): UrlSearchState {
    return { ...readSearchTerms(search), shop: readShopFilter(search) };
}

/**
 * Restore search terms from the URL and keep them in sync.
 * @param deps - Host callbacks
 * @returns URL sync handler
 */
export function createUrlSync(deps: UrlSyncDeps): UrlSync {
    let settled = true;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const initial = readState(globalThis.location.search);
    if (initial.buy || initial.pay || initial.shop) {
        deps.applyState(initial, false);
    }

    globalThis.addEventListener('popstate', () => {
        clearTimeout(settleTimer);
        settled = true;
        deps.applyState(readState(globalThis.location.search), true);
    });

    function record(): void {
        const { buy, pay, shop } = deps.getState();
        const href = buildShopFilterHref(buildSearchHref(globalThis.location.href, buy, pay), shop);
        if (href === globalThis.location.href) { return; }

        if (settled) {
            history.pushState(undefined, '', href);
            settled = false;
        } else {
            history.replaceState(undefined, '', href);
        }
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { settled = true; }, QUICK_SEARCH.HISTORY_SETTLE_MS);
    }

    return { record };
}
