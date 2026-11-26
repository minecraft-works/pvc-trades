/**
 * Keeps the Buying/Paying search in the URL (`?buy=…&pay=…`), so probes can
 * be bookmarked or shared and Back/Forward step between earlier probes.
 *
 * While typing, the current history entry is updated in place; once a search
 * has been unchanged for a moment it is "settled" and the next change starts
 * a new history entry.
 *
 * @module quick-search/url-sync
 */

import { QUICK_SEARCH } from '../constants.js';
import { buildSearchHref, readSearchTerms } from '../search/query.js';

/** Dependencies from the host module */
export interface UrlSyncDeps {
    /** Current raw search terms */
    getTerms: () => { buy: string; pay: string };
    /** Put terms into the search fields; `runSearch` re-runs the search */
    applyTerms: (buy: string, pay: string, runSearch: boolean) => void;
}

/** Public API */
export interface UrlSync {
    /** Record the current search terms in the URL (call after each search) */
    record: () => void;
}

/**
 * Restore search terms from the URL and keep them in sync.
 * @param deps - Host callbacks
 * @returns URL sync handler
 */
export function createUrlSync(deps: UrlSyncDeps): UrlSync {
    let settled = true;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const initial = readSearchTerms(globalThis.location.search);
    if (initial.buy || initial.pay) {
        deps.applyTerms(initial.buy, initial.pay, false);
    }

    globalThis.addEventListener('popstate', () => {
        clearTimeout(settleTimer);
        settled = true;
        const terms = readSearchTerms(globalThis.location.search);
        deps.applyTerms(terms.buy, terms.pay, true);
    });

    function record(): void {
        const { buy, pay } = deps.getTerms();
        const href = buildSearchHref(globalThis.location.href, buy, pay);
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
