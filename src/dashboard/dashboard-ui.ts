/**
 * Daily Deals Dashboard UI rendering and interaction.
 *
 * Uses a factory pattern: call {@link createDashboardUIHandler} with
 * dependencies from the host module (main.ts) to get a handler object.
 *
 * @module dashboard/dashboard-ui
 */

import { DASHBOARD } from '../constants.js';
import {
    computeDashboardData,
    escapeHtml,
    formatRelativeTime,
} from '../library.js';
import type { DeviationResult } from '../search/index.js';
import type { DashboardData, FavoriteItem,PriceDrop, Trade, TradeSnapshot, WatchlistHit } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

/** CSS class for delta comparison spans */
const DELTA_CLASS = 'dashboard-item-delta';
/** CSS class for dashboard section containers */
const SECTION_CLASS = 'dashboard-section';
/** ID of the clear-search-want button */
const CLEAR_SEARCH_WANT_ID = 'clear-search-want';

/** Dashboard banner selector */
const DASHBOARD_SELECTOR = '#deals-dashboard';
/** Dashboard toggle button selector */
const DASHBOARD_TOGGLE_SELECTOR = '#open-dashboard';

// ============================================================================
// Dependency & Handler interfaces
// ============================================================================

/**
 * Dependencies injected from the host module.
 */
export interface DashboardUIDependencies {
    /** Return current trade list */
    getAllTrades: () => readonly Trade[];
    /** Return current deviation calculator */
    getDeviation: () => (trade: Trade) => DeviationResult | undefined;
    /** Trigger a search refresh after clicking a dashboard link */
    search: () => void;
    /** Show / hide a clear button for the given input */
    updateClearButtonVisibility: (input: HTMLInputElement, clearButtonId: string) => void;
    /** Snapshot store – loadBaseline & appendIfDue */
    snapshotStore: {
        loadBaseline: () => TradeSnapshot | undefined;
        appendIfDue: (trades: readonly Trade[], getDeviation: (t: Trade) => DeviationResult | undefined) => void;
    };
    /** Favorites store – getAll */
    favoritesStore: {
        getAll: () => FavoriteItem[];
    };
}

/**
 * Public API returned by the factory.
 */
export interface DashboardUIHandler {
    /** Load baseline, compute diff, render banner (called after data load) */
    showDashboard: () => void;
    /** Toggle dashboard banner visibility */
    toggleDashboard: () => void;
    /** Dismiss (hide) the dashboard banner */
    dismissDashboard: () => void;
}

// ============================================================================
// Pure helpers
// ============================================================================

/**
 * Format a deviation value as a signed percentage string.
 * Uses the minus glyph (−) for negative values, matching the main trade table.
 * @param deviation - Numeric deviation percentage to format
 * @returns Signed percentage string, e.g. "+5%" or "−10%"
 */
function formatDeviationText(deviation: number): string {
    if (deviation > 0) { return `+${deviation}%`; }
    if (deviation < 0) { return `−${Math.abs(deviation)}%`; }
    return '0%';
}

/**
 * Build the delta comparison HTML for a watchlist hit.
 * @param hit - Watchlist hit with current and optional previous deviation
 * @returns HTML string showing deviation change, or empty string if no prior data
 */
function buildWatchlistDelta(hit: WatchlistHit): string {
    if (hit.previousDeviation === undefined) { return ''; }
    const diff = hit.currentDeviation - hit.previousDeviation;
    const previousText = formatDeviationText(hit.previousDeviation);
    if (diff < 0) {
        return `<span class="${DELTA_CLASS} improved">(was ${previousText}) ↓ better</span>`;
    }
    if (diff > 0) {
        return `<span class="${DELTA_CLASS}">(was ${previousText}) ↑ worse</span>`;
    }
    return `<span class="${DELTA_CLASS}">(unchanged)</span>`;
}

/**
 * Render a single watchlist hit item as HTML.
 * @param hit - Watchlist hit to render
 * @returns HTML string for a single watchlist item
 */
function renderWatchlistItem(hit: WatchlistHit): string {
    const deviationClass = hit.currentDeviation < 0 ? 'good' : 'bad';
    const deviationText = formatDeviationText(hit.currentDeviation);
    const deltaHtml = buildWatchlistDelta(hit);
    return `<div class="dashboard-item">
        <span class="dashboard-item-name dashboard-item-link" data-search="${escapeHtml(hit.itemName)}" title="Search for ${escapeHtml(hit.itemName)}">${escapeHtml(hit.itemName)}</span>
        <span class="dashboard-item-dev ${deviationClass}">${deviationText}</span>
        ${deltaHtml}
    </div>`;
}

// ============================================================================
// DOM builders
// ============================================================================

/**
 * Build the watchlist hits section element.
 * @param hits - Watchlist hits to display
 * @returns Section element containing sorted watchlist hit items
 */
function buildWatchlistSection(hits: readonly WatchlistHit[]): HTMLDivElement {
    const section = document.createElement('div');
    section.className = SECTION_CLASS;
    const sorted = [...hits].toSorted((a, b) => a.currentDeviation - b.currentDeviation);
    const items = sorted.map(hit => renderWatchlistItem(hit)).join('');
    section.innerHTML = `
        <div class="dashboard-section-title">🔥 Watchlist Deals (${hits.length})</div>
        <div class="dashboard-section-items dashboard-items-grid">${items}</div>
    `;
    return section;
}

/**
 * Build the new trades section element.
 * @param count - Number of new trades detected
 * @returns Section element summarising new trade count
 */
function buildNewTradesSection(count: number): HTMLDivElement {
    const section = document.createElement('div');
    section.className = SECTION_CLASS;
    section.innerHTML = `
        <div class="dashboard-section-title">🆕 New Trades</div>
        <div class="dashboard-summary">${count} new listing${count === 1 ? '' : 's'} appeared</div>
    `;
    return section;
}

/**
 * Build the price drops section element.
 * Returns undefined when there are no drops below median.
 * @param drops - All candidate price drops
 * @returns Section element for below-median price drops, or undefined if none exist
 */
function buildPriceDropsSection(drops: readonly PriceDrop[]): HTMLDivElement | undefined {
    const belowMedian = drops.filter(drop => drop.newDeviation < 0);
    if (belowMedian.length === 0) { return undefined; }

    const section = document.createElement('div');
    section.className = SECTION_CLASS;
    const dropItems = belowMedian.map(drop => {
        const deviationText = formatDeviationText(drop.newDeviation);
        const oldText = formatDeviationText(drop.oldDeviation);
        return `<div class="dashboard-item">
            <span class="dashboard-item-name dashboard-item-link" data-search="${escapeHtml(drop.itemName)}" title="Search for ${escapeHtml(drop.itemName)}">${escapeHtml(drop.itemName)}</span>
            <span class="dashboard-item-dev good">${deviationText}</span>
            <span class="${DELTA_CLASS} improved">(was ${oldText})</span>
        </div>`;
    }).join('');
    section.innerHTML = `
        <div class="dashboard-section-title">📉 Price Drops (${belowMedian.length})</div>
        <div class="dashboard-section-items dashboard-items-grid">${dropItems}</div>
    `;
    return section;
}

/**
 * Append dashboard sections (watchlist hits, new trades, price drops).
 * @param sectionsElement - Container element for the dashboard sections
 * @param data - Computed dashboard data to render
 */
function appendDashboardSections(sectionsElement: Element, data: DashboardData): void {
    sectionsElement.innerHTML = '';

    if (data.watchlistHits.length > 0) {
        sectionsElement.append(buildWatchlistSection(data.watchlistHits));
    }
    if (data.newTradeKeys.length > 0) {
        sectionsElement.append(buildNewTradesSection(data.newTradeKeys.length));
    }
    if (data.priceDrops.length > 0) {
        const priceDropsSection = buildPriceDropsSection(data.priceDrops);
        if (priceDropsSection) {
            sectionsElement.append(priceDropsSection);
        }
    }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Dashboard UI handler wired to the given dependencies.
 *
 * @param deps - Dependencies injected from the host module
 * @returns Handler with showDashboard, toggleDashboard, and dismissDashboard methods
 * @example
 * ```ts
 * const dashboardUI = createDashboardUIHandler({
 *     getAllTrades: () => allTrades,
 *     getDeviation: () => getDeviation,
 *     search,
 *     updateClearButtonVisibility,
 *     snapshotStore,
 *     favoritesStore,
 * });
 * dashboardUI.showDashboard();
 * ```
 */
export function createDashboardUIHandler(deps: DashboardUIDependencies): DashboardUIHandler {
    /**
     * Wire click handlers on dashboard item links to populate search.
     * @param container - Container element whose links should be wired
     */
    function wireDashboardItemLinks(container: Element): void {
        for (const link of container.querySelectorAll('.dashboard-item-link')) {
            if (!(link instanceof HTMLElement) || link.dataset.clickWired) { continue; }
            link.dataset.clickWired = '1';
            link.addEventListener('click', () => {
                const searchTerm = link.dataset.search ?? '';
                const wantInput = document.querySelector<HTMLInputElement>('#searchWant');
                if (!wantInput) { return; }
                wantInput.value = searchTerm;
                deps.updateClearButtonVisibility(wantInput, CLEAR_SEARCH_WANT_ID);
                deps.search();
                wantInput.focus();
            });
        }
    }

    /**
     * Render the dashboard banner with sections for watchlist hits, new trades,
     * and price drops.
     * @param data - Computed dashboard data to render
     * @param options - Rendering options
     * @param options.autoOpen - Whether to open the dashboard automatically
     */
    function renderDashboard(data: DashboardData, options?: { autoOpen: boolean }): void {
        const { autoOpen = true } = options ?? {};
        const dashboard = document.querySelector(DASHBOARD_SELECTOR);
        if (!dashboard) { return; }

        const timeAgoElement = document.querySelector('#dashboard-time-ago');
        if (timeAgoElement && data.lastVisit) {
            timeAgoElement.textContent = formatRelativeTime(data.lastVisit);
        }

        const sectionsElement = document.querySelector('#dashboard-sections');
        if (!sectionsElement) { return; }

        appendDashboardSections(sectionsElement, data);
        wireDashboardItemLinks(sectionsElement);

        document.querySelector('#dismiss-dashboard')?.addEventListener('click', dismissDashboardBanner);
        if (autoOpen) {
            dashboard.classList.remove('hidden');
        }
    }

    function showDashboard(): void {
        const baseline = deps.snapshotStore.loadBaseline();
        const favorites = deps.favoritesStore.getAll();
        const currentGetDeviation = deps.getDeviation();

        const dashboardData = computeDashboardData(
            deps.getAllTrades(),
            currentGetDeviation,
            baseline,
            favorites,
            DASHBOARD.PRICE_DROP_THRESHOLD,
        );

        deps.snapshotStore.appendIfDue(deps.getAllTrades(), currentGetDeviation);

        const hasContent = dashboardData.watchlistHits.length > 0
            || dashboardData.newTradeKeys.length > 0
            || dashboardData.priceDrops.length > 0;

        if (!hasContent || !baseline) {
            return;
        }

        const toggleButton = document.querySelector(DASHBOARD_TOGGLE_SELECTOR);
        toggleButton?.classList.remove('hidden');

        renderDashboard(dashboardData, { autoOpen: false });
    }

    return { showDashboard, toggleDashboard: toggleDashboardBanner, dismissDashboard: dismissDashboardBanner };
}

/** Dismiss the dashboard banner */
function dismissDashboardBanner(): void {
    const dashboard = document.querySelector(DASHBOARD_SELECTOR);
    if (dashboard) {
        dashboard.classList.add('hidden');
    }
}

/** Toggle the dashboard banner visibility */
function toggleDashboardBanner(): void {
    const dashboard = document.querySelector(DASHBOARD_SELECTOR);
    if (dashboard) {
        dashboard.classList.toggle('hidden');
    }
}
