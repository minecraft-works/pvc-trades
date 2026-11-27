/**
 * Flips panel of the exchange-rates dialog: profitable buy-here, sell-there
 * round trips as compact cards, each with a one-click "add both to cart".
 *
 * @module dialogs/flips-panel
 */

import { html, type TemplateResult } from 'lit-html';

import { getCostParts } from '../library.js';
import { replaceContent } from '../rendering/render.js';
import type { Trade } from '../types.js';
import type { Flip, FlipLeg } from '../valuation/flips.js';

/** Most flips listed; the rest are rarely worth a trip */
const MAX_FLIPS_SHOWN = 50;

/** Dependencies from the host module */
export interface FlipsPanelDeps {
    /** Current flips, best first */
    getFlips: () => readonly Flip[];
    /** Put both legs in the cart with the trip's quantities */
    addToCart: (flip: Flip) => void;
    /** Whether both legs are already in the cart */
    isInCart: (flip: Flip) => boolean;
    /** Open a shop on the map */
    openShop: (trade: Trade) => void;
}

function formatDistance(blocks: number): string {
    return blocks < 1000 ? `${Math.round(blocks)} blocks` : `${(blocks / 1000).toFixed(1)}k blocks`;
}

function formatNumber(value: number): string {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function shopLabel(trade: Trade): string {
    return trade.shopName ?? trade.shopOwner ?? `${trade.x}, ${trade.z}`;
}

/**
 * One aligned row: verb, rate, number of uses, shop
 * @param verb - Buy or Sell
 * @param leg - The shop visit
 * @param currency - Currency name as shown in the table
 * @param index - Flip index, for the click handler
 * @returns Row template
 */
function buildLeg(verb: 'Buy' | 'Sell', leg: FlipLeg, currency: string, index: number): TemplateResult {
    const rate = `${formatNumber(leg.itemAmount)} for ${formatNumber(leg.currencyAmount)} ${currency}`;
    const shop = shopLabel(leg.trade);
    const owner = leg.trade.shopOwner && leg.trade.shopName ? ` by ${leg.trade.shopOwner}` : '';
    return html`<div class="flip-leg">
        <span class="flip-leg-verb">${verb}</span>
        <span class="flip-leg-rate" title="${rate}">${rate}</span>
        <span class="flip-leg-uses" title="Use this trade ${leg.uses} times">×${leg.uses}</span>
        <button type="button" class="flip-shop" data-flip="${index}" data-leg="${verb.toLowerCase()}" title="${shop}${owner} · show on map">${shop}</button>
    </div>`;
}

function buildCard(flip: Flip, index: number, inCart: boolean): TemplateResult {
    // Same names as the trade table (no enchantment signature on currencies)
    const item = flip.buy.trade.resultName;
    const currency = getCostParts(flip.buy.trade)[0]?.name ?? flip.currency;
    const profit = `+${formatNumber(flip.profit)} ${currency}`;
    return html`<li class="flip-card">
        <div class="flip-head">
            <span class="flip-item" title="${item}">${item}</span>
            <span class="flip-profit" title="${profit} per trip, after paying for everything bought">${profit}</span>
        </div>
        <div class="flip-legs">
            ${buildLeg('Buy', flip.buy, currency, index)}
            ${buildLeg('Sell', flip.sell, currency, index)}
        </div>
        <div class="flip-foot">
            <span class="flip-meta">+${Math.round(flip.margin * 100)}% · ${formatDistance(flip.distance)} apart</span>
            <button type="button" class="flip-add" data-flip="${index}" aria-label="Add both trades to the cart" ?disabled=${inCart}>${inCart ? '✓ In cart' : '+ Cart'}</button>
        </div>
    </li>`;
}

/**
 * Render the flips list into its panel.
 * @param panel - Panel element (its content is replaced)
 * @param deps - Host callbacks
 */
export function renderFlipsPanel(panel: HTMLElement, deps: FlipsPanelDeps): void {
    const flips = deps.getFlips().slice(0, MAX_FLIPS_SHOWN);
    if (flips.length === 0) {
        replaceContent(panel, html`<p class="muted flips-empty">No flips right now. Check back after the next shop update.</p>`);
        return;
    }

    replaceContent(panel, html`<p class="flips-intro">Buy at one shop, sell to another for more. Profit is per trip, within stock.</p>
        <ul class="flip-list">${flips.map((flip, index) => buildCard(flip, index, deps.isInCart(flip)))}</ul>`);

    panel.addEventListener('click', event => {
        if (!(event.target instanceof Element)) { return; }
        const button = event.target.closest<HTMLButtonElement>('button[data-flip]');
        const flip = flips[Number(button?.dataset.flip)];
        if (!button || !flip) { return; }

        if (button.classList.contains('flip-add')) {
            deps.addToCart(flip);
            button.textContent = '✓ In cart';
            button.disabled = true;
            return;
        }
        deps.openShop(button.dataset.leg === 'buy' ? flip.buy.trade : flip.sell.trade);
    });
}
