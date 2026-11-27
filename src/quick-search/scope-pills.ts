/**
 * Pill row under the search fields: one pill per active lens, shop filter and
 * trade filter, in WHAT → WHO → HOW order. Clicking a pill opens the menu to
 * change it; its ✕ removes it. The row is hidden while nothing narrows the
 * results. Alt+1…4 toggle the trade filters from anywhere.
 *
 * @module quick-search/scope-pills
 */

import { html, nothing, render, type TemplateResult } from 'lit-html';

import { findLens } from '../search/lenses.js';
import { isScopeActive, type SearchScope, type SearchSide, TRADE_FILTERS } from '../search/scope.js';
import { formatShopFilter } from '../search/shop-filter.js';
import type { QuickFilters } from '../types.js';
import type { ScopeTone } from './autocomplete.js';
import { LENS_SUBMENU_ID, SHOP_SUBMENU_ID } from './field-menu.js';

/** Dependencies from the host module */
export interface ScopePillsDeps {
    getScope: () => SearchScope;
    /** Replace the scope, e.g. without one pill */
    setScope: (scope: SearchScope) => void;
    /** Open a field's menu, or one of its submenus, to change a pill */
    openMenu: (side: SearchSide, submenuId?: string) => void;
    /** Focus a search field, e.g. after its last pill was removed */
    focusField: (side: SearchSide) => void;
}

/** Public API */
export interface ScopePills {
    /** Redraw the row from the current scope */
    render: () => void;
}

interface PillSpec {
    readonly id: string;
    readonly tone: ScopeTone;
    /** Field the pill belongs to */
    readonly side: SearchSide;
    readonly prefix: string | undefined;
    readonly label: string;
    /** Accessible name of the pill */
    readonly description: string;
    readonly edit: () => void;
    readonly remove: () => void;
}

const LENS_PREFIX: Readonly<Record<SearchSide, string>> = { buy: 'buying', pay: 'paying with' };

function pillTemplate(pill: PillSpec, onRemove: () => void): TemplateResult {
    return html`<span class="scope-pill scope-pill--${pill.tone}" data-pill=${pill.id} role="listitem">
        <button type="button" class="scope-pill-body" title="Change" aria-label=${`${pill.description}. Change`} @click=${pill.edit}>
            ${pill.prefix ? html`<span class="scope-pill-prefix">${pill.prefix}</span> ` : nothing}<span class="scope-pill-label">${pill.label}</span>
        </button>
        <button type="button" class="scope-pill-clear" title="Remove" aria-label=${`Remove ${pill.description}`} @click=${onRemove}>✕</button>
    </span>`;
}

/**
 * Render the pill row into its container and keep it in sync on {@link ScopePills.render}.
 * @param container - Element that receives the pills
 * @param deps - Host callbacks
 * @returns Pill row handler
 */
export function createScopePills(container: HTMLElement, deps: ScopePillsDeps): ScopePills {
    function lensPill(scope: SearchScope, side: SearchSide): PillSpec | undefined {
        const lens = findLens(side === 'buy' ? scope.buyLens : scope.payLens);
        if (!lens) { return undefined; }
        return {
            side,
            id: `lens-${side}`,
            tone: 'what',
            prefix: LENS_PREFIX[side],
            label: lens.label,
            description: `Lens ${LENS_PREFIX[side]} ${lens.label}`,
            edit: () => { deps.openMenu(side, LENS_SUBMENU_ID); },
            remove: () => { deps.setScope(side === 'buy' ? { ...deps.getScope(), buyLens: undefined } : { ...deps.getScope(), payLens: undefined }); },
        };
    }

    function collectPills(scope: SearchScope): readonly PillSpec[] {
        const pills: PillSpec[] = [];
        for (const side of ['buy', 'pay'] as const) {
            const pill = lensPill(scope, side);
            if (pill) { pills.push(pill); }
        }
        if (scope.shop) {
            const { shop } = scope;
            pills.push({
                id: 'shop',
                tone: 'who',
                side: 'buy',
                prefix: shop.shop ? 'at' : 'by',
                label: shop.shop ?? shop.owner,
                description: `Shop filter ${formatShopFilter(shop)}`,
                edit: () => { deps.openMenu('buy', SHOP_SUBMENU_ID); },
                remove: () => { deps.setScope({ ...deps.getScope(), shop: undefined }); },
            });
        }
        for (const spec of TRADE_FILTERS) {
            if (!scope.filters[spec.key]) { continue; }
            const side: SearchSide = spec.sides.includes('buy') ? 'buy' : 'pay';
            pills.push({
                side,
                id: `filter-${spec.param}`,
                tone: 'how',
                prefix: undefined,
                label: spec.label,
                description: `Filter ${spec.menuLabel}`,
                edit: () => { deps.openMenu(side); },
                remove: () => { deps.setScope({ ...deps.getScope(), filters: { ...deps.getScope().filters, [spec.key]: false } }); },
            });
        }
        return pills;
    }

    /**
     * Remove a pill and keep keyboard focus in the row: on the next pill's ✕,
     * or on the pill's search field when none are left
     * @param pill - Pill to remove
     */
    function removePill(pill: PillSpec): void {
        const ids = [...container.querySelectorAll<HTMLElement>('[data-pill]')].map(element => element.dataset.pill);
        const index = ids.indexOf(pill.id);
        pill.remove();
        const clears = [...container.querySelectorAll<HTMLElement>('.scope-pill-clear')];
        const next = clears[Math.min(index, clears.length - 1)];
        if (next) {
            next.focus();
        } else {
            deps.focusField(pill.side);
        }
    }

    function renderPills(): void {
        const scope = deps.getScope();
        container.classList.toggle('hidden', !isScopeActive(scope));
        render(html`${collectPills(scope).map(pill => pillTemplate(pill, () => { removePill(pill); }))}`, container);
    }

    renderPills();
    return { render: renderPills };
}

/**
 * Alt+1…4 toggle the trade filters, in menu order.
 * @param event - Keydown event
 * @param toggle - Flip a filter
 * @returns True if the event was a filter shortcut
 */
export function handleFilterShortcut(event: KeyboardEvent, toggle: (key: keyof QuickFilters) => void): boolean {
    if (!event.altKey || event.ctrlKey || event.metaKey) { return false; }
    const digit = /^Digit(?<n>\d)$/.exec(event.code)?.groups?.n;
    const spec = digit ? TRADE_FILTERS[Number(digit) - 1] : undefined;
    if (!spec) { return false; }
    toggle(spec.key);
    return true;
}
