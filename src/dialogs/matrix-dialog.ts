/**
 * Exchange Rates Dialog Module
 *
 * Rates tab: key currency pairs in a small table (the more valuable item
 * first, with names and icons), other currencies found in the market, and a
 * converter for any two currencies. Each rate shows both sides of the
 * market at once: Buy is what an item costs at a shop, Sell is what a shop
 * pays for it. Rates come from the currency graph (ADR-019), so Sell never
 * exceeds Buy. The Flips tab lists profitable round trips between shops.
 *
 * @module dialogs/matrix-dialog
 */

import { DIALOG_IDS, SELECTORS } from '../constants.js';
import { escapeHtml } from '../library.js';
import type { CurrencyGraph } from '../valuation/currency-graph.js';
import { currencyDisplayName, type DisplayRate, formatAmount, getBlockOf, presentRate } from '../valuation/rate-presentation.js';
import { type FlipsPanelDeps, renderFlipsPanel } from './flips-panel.js';

// ============================================================================
// Constants
// ============================================================================

/** Icon URLs for core currency items, by lowercase name */
const ITEM_ICONS: Readonly<Record<string, string>> = {
    'netherite ingot': 'icons/netherite_ingot.png',
    'netherite block': 'icons/netherite_block.png',
    'diamond block': 'icons/diamond_block.png',
    'diamond': 'icons/diamond.png',
    'emerald block': 'icons/emerald_block.png',
    'emerald': 'icons/emerald.png',
    'gold block': 'icons/gold_block.png',
    'gold ingot': 'icons/gold_ingot.png',
    'iron block': 'icons/iron_block.png',
    'iron ingot': 'icons/iron_ingot.png',
};

/** Key currency pairs, in base units; each is shown with its more valuable item first */
const KEY_PAIRS: readonly (readonly [string, string])[] = [
    ['Netherite ingot', 'Diamond'],
    ['Diamond', 'Emerald'],
    ['Gold ingot', 'Emerald'],
    ['Emerald', 'Iron ingot'],
];

/** Core currencies other currencies are quoted in, in order of preference */
const QUOTE_CURRENCIES = ['Diamond', 'Emerald'];

const DIALOG_HEADER_HTML = '<header><h2>Exchange Rates</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';

const RATES_HINT_HTML = '<p class="rates-hint"><strong>Buy</strong> is what one item costs at a shop, <strong>Sell</strong> what a shop pays you for it. <strong>≈</strong> means there is no direct market, so the rate goes through other currencies.</p>';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Icon and name of a currency
 * @param name - Currency name
 * @returns HTML with an icon (when known) and the display name
 */
function itemWithIcon(name: string): string {
    const url = ITEM_ICONS[name.toLowerCase()];
    const icon = url ? `<img src="${url}" alt="" class="matrix-icon" aria-hidden="true">` : '';
    return `${icon}<span>${escapeHtml(currencyDisplayName(name))}</span>`;
}

/**
 * Explain where a rate comes from
 * @param rate - Display rate
 * @returns Tooltip text, or empty for a direct market
 */
function describeSource(rate: DisplayRate): string {
    const parts: string[] = [];
    if (rate.via.length > 0) { parts.push(`No direct market: through ${rate.via.map(name => currencyDisplayName(name)).join(', ')}`); }
    if (rate.crossed) { parts.push('Shops buy for more than others sell; showing the middle rate'); }
    return parts.join('. ');
}

/**
 * One row of a rates table
 * @param rate - Display rate, or undefined when there is no data
 * @param pair - Currencies of the row, used when there is no rate
 * @returns Row HTML
 */
function buildRateRow(rate: DisplayRate | undefined, pair: readonly [string, string]): string {
    const [item, unit] = rate ? [rate.item, rate.unit] : pair;
    const prefix = rate && rate.via.length > 0 ? '≈' : '';
    const amount = (value: number | undefined): string => (value === undefined ? '\u2014' : `${prefix}${formatAmount(value)}`);
    const title = rate ? describeSource(rate) : '';
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
    return `<div class="rate-table-row" role="row"${titleAttribute}>
            <span class="rate-item" role="cell">${itemWithIcon(item)}</span>
            <span class="rate-num" role="cell">${amount(rate?.buy)}</span>
            <span class="rate-num" role="cell">${amount(rate?.sell)}</span>
            <span class="rate-unit" role="cell">${itemWithIcon(unit)}</span>
        </div>`;
}

/**
 * A rates table with its heading
 * @param title - Section title
 * @param rows - Row HTML
 * @returns Section HTML
 */
function buildRatesSection(title: string, rows: string): string {
    return `<section class="converter-section">
        <h3 class="converter-section-title">${escapeHtml(title)}</h3>
        <div class="rate-table" role="table" aria-label="${escapeHtml(title)}">
            <div class="rate-table-row rate-table-head" role="row">
                <span role="columnheader">1 ×</span>
                <span class="rate-num" role="columnheader">Buy</span>
                <span class="rate-num" role="columnheader">Sell</span>
                <span role="columnheader">in</span>
            </div>
            ${rows}
        </div>
    </section>`;
}

/**
 * Key rates between the core currencies
 * @param graph - Currency graph
 * @returns Section HTML
 */
function buildKeyRates(graph: CurrencyGraph): string {
    const rows = KEY_PAIRS.map(pair => buildRateRow(presentRate(graph, pair[0], pair[1]), pair)).join('');
    return buildRatesSection('Key rates', rows);
}

/**
 * Rates of other currencies (coins, certificates) found in the market
 * @param graph - Currency graph
 * @returns Section HTML, or empty when there are none
 */
function buildOtherRates(graph: CurrencyGraph): string {
    const core = new Set(KEY_PAIRS.flat().map(name => name.toLowerCase()));
    const rows: string[] = [];
    for (const currency of graph.currencies) {
        if (core.has(currency.toLowerCase())) { continue; }
        for (const quoteCurrency of QUOTE_CURRENCIES) {
            const rate = presentRate(graph, currency, quoteCurrency);
            if (rate) {
                rows.push(buildRateRow(rate, [currency, quoteCurrency]));
                break;
            }
        }
    }
    return rows.length > 0 ? buildRatesSection('Other currencies', rows.join('')) : '';
}

/**
 * Currencies offered in the converter: every currency, plus its block
 * @param graph - Currency graph
 * @returns Currency names
 */
function getConverterOptions(graph: CurrencyGraph): readonly string[] {
    const options: string[] = [];
    for (const currency of graph.currencies) {
        options.push(currency);
        const block = getBlockOf(currency);
        if (block) { options.push(block.name); }
    }
    return options;
}

/**
 * Build the <option> elements for a currency select dropdown
 * @param options - All available currencies
 * @param selected - Currently selected currency
 * @returns HTML string of <option> elements
 */
function buildCurrencyOptions(options: readonly string[], selected: string): string {
    return options
        .map(name => `<option value="${escapeHtml(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(currencyDisplayName(name))}</option>`)
        .join('');
}

/**
 * Build the converter
 * @param options - Available currencies for the dropdowns
 * @returns HTML string for the converter section
 */
function buildConverter(options: readonly string[]): string {
    const from = options.find(name => name === 'Netherite ingot') ?? options[0] ?? '';
    const to = options.find(name => name === 'Diamond block') ?? options[1] ?? '';
    return `<section class="converter-section">
        <h3 class="converter-section-title">Convert</h3>
        <div class="converter-custom">
            <div class="converter-row">
                <input type="number" id="converter-from-amount" class="converter-input"
                       inputmode="decimal" min="0" step="any" value="1" aria-label="Amount to convert">
                <select id="converter-from-select" class="converter-select" aria-label="Convert from">${buildCurrencyOptions(options, from)}</select>
            </div>
            <div class="converter-row">
                <button type="button" id="converter-swap" class="converter-swap-btn" aria-label="Swap currencies" title="Swap currencies">\u21C5</button>
                <select id="converter-to-select" class="converter-select" aria-label="Convert to">${buildCurrencyOptions(options, to)}</select>
            </div>
            <div class="converter-results">
                <div class="converter-result"><span class="converter-result-label">Buy</span><strong id="converter-buy">\u2014</strong></div>
                <div class="converter-result"><span class="converter-result-label">Sell</span><strong id="converter-sell">\u2014</strong></div>
            </div>
        </div>
    </section>`;
}

/**
 * Read the converter's amount and currencies
 * @param container - Dialog content
 * @returns Chosen amount and currencies
 */
function readConverter(container: HTMLElement): { readonly amount: number; readonly from: string; readonly to: string } {
    const from = container.querySelector<HTMLSelectElement>('#converter-from-select')?.value ?? '';
    const to = container.querySelector<HTMLSelectElement>('#converter-to-select')?.value ?? '';
    const amount = Number.parseFloat(container.querySelector<HTMLInputElement>('#converter-from-amount')?.value ?? '') || 0;
    return { amount, from, to };
}

/**
 * Update the converter results for the chosen amount and currencies
 * @param container - Dialog content
 * @param graph - Currency graph
 */
function updateConverter(container: HTMLElement, graph: CurrencyGraph): void {
    const { amount, from, to } = readConverter(container);
    const quote = graph.quote(from, to);
    const prefix = quote && quote.via.length > 0 ? '≈' : '';
    const convert = (rate: number | undefined): string =>
        (rate === undefined ? '\u2014' : `${prefix}${formatAmount(amount * rate)}`);
    const buy = container.querySelector('#converter-buy');
    const sell = container.querySelector('#converter-sell');
    if (buy) { buy.textContent = convert(quote?.buy); }
    if (sell) { sell.textContent = convert(quote?.sell); }
}

/**
 * Wire the converter inputs and swap button
 * @param container - Dialog content
 * @param graph - Currency graph
 */
function wireConverter(container: HTMLElement, graph: CurrencyGraph): void {
    const update = (): void => { updateConverter(container, graph); };
    for (const id of ['#converter-from-select', '#converter-to-select', '#converter-from-amount']) {
        container.querySelector(id)?.addEventListener('input', update);
    }
    container.querySelector('#converter-swap')?.addEventListener('click', () => {
        const fromSelect = container.querySelector<HTMLSelectElement>('#converter-from-select');
        const toSelect = container.querySelector<HTMLSelectElement>('#converter-to-select');
        if (!fromSelect || !toSelect) { return; }
        const previousFrom = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = previousFrom;
        update();
    });
    update();
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render the exchange rates dialog: Rates (key rates, other currencies and
 * converter) and Flips.
 *
 * @param container - Container element for the dialog content
 * @param graph - Exchange rates between currencies, or undefined if not available
 * @param getElement - Helper function to get elements by ID
 * @param flips - Flips tab callbacks; the tab is left out without them
 */
export function renderExchangeMatrix(
    container: HTMLElement,
    graph: CurrencyGraph | undefined,
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T,
    flips?: FlipsPanelDeps
): void {
    const closeDialog = (): void => { getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close(); };
    if (!graph) {
        container.innerHTML = `${DIALOG_HEADER_HTML}<p class="muted">No price data available</p>`;
        container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', closeDialog);
        return;
    }

    // Flips do not depend on exchange rates, so the tabs stay even without any rate
    const hasRates = graph.currencies.length > 0;
    const ratesContent = hasRates
        ? `${RATES_HINT_HTML}
            ${buildKeyRates(graph)}
            ${buildOtherRates(graph)}
            ${buildConverter(getConverterOptions(graph))}`
        : '<p class="muted">No exchange rates yet: too few shops trade currencies with each other.</p>';
    const flipsTab = flips ? '<button class="matrix-tab" data-tab="flips" title="Buy at one shop, sell to another for profit">Flips</button>' : '';
    container.innerHTML = `${DIALOG_HEADER_HTML}
        <div class="matrix-tabs">
            <button class="matrix-tab matrix-tab--active" data-tab="rates">Rates</button>
            ${flipsTab}
        </div>
        <div class="matrix-rates">
            ${ratesContent}
        </div>
        <div class="matrix-flips hidden"></div>`;

    if (hasRates) { wireConverter(container, graph); }

    const ratesPanel = container.querySelector<HTMLElement>('.matrix-rates');
    const flipsPanel = container.querySelector<HTMLElement>('.matrix-flips');
    let flipsRendered = false;
    for (const tab of container.querySelectorAll<HTMLButtonElement>('.matrix-tab')) {
        tab.addEventListener('click', () => {
            for (const element of container.querySelectorAll('.matrix-tab')) {
                element.classList.toggle('matrix-tab--active', element === tab);
            }
            const showFlips = tab.dataset.tab === 'flips';
            ratesPanel?.classList.toggle('hidden', showFlips);
            flipsPanel?.classList.toggle('hidden', !showFlips);
            if (showFlips && flips && flipsPanel && !flipsRendered) {
                flipsRendered = true;
                renderFlipsPanel(flipsPanel, flips);
            }
        });
    }

    container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', closeDialog);
}
