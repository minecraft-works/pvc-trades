/**
 * Flip Finder
 *
 * Finds round trips between two shops: buy an item from one shop and sell it
 * to another for more of the same currency. Uses the same item identity as
 * pricing, so look-alike items (unnamed written books, potions) never pair up.
 *
 * @module valuation/flips
 */

import { getTradeKey } from '../map/map-math.js';
import { calculateRouteDistance } from '../routing/route-optimizer.js';
import type { Trade } from '../types.js';
import { getPairKey, getPairPrice, type PairLot } from './item-identity.js';

/** One shop visit of a flip */
export interface FlipLeg {
    readonly trade: Trade;
    /** How many times to use the trade */
    readonly uses: number;
    /** Items bought or sold per use */
    readonly itemAmount: number;
    /** Currency paid or received per use */
    readonly currencyAmount: number;
}

/** A profitable buy-here, sell-there round trip */
export interface Flip {
    /** Item bought and sold again (valuation name) */
    readonly item: string;
    /** What the profit is counted in (valuation name) */
    readonly currency: string;
    /** Shop that sells the item for the currency */
    readonly buy: FlipLeg;
    /** Shop that buys the item for the currency */
    readonly sell: FlipLeg;
    /** Currency gained by one trip, after paying for everything bought */
    readonly profit: number;
    /** Price difference per item, e.g. 0.5 = sells for 50% more than it costs */
    readonly margin: number;
    /** Profit in emeralds, when the currency has a trusted value */
    readonly profitValue: number | undefined;
    /** Overworld-equivalent distance between the two shops */
    readonly distance: number;
}

/** Tuning for {@link findFlips} */
export interface FlipOptions {
    /** Smallest price difference worth showing (default 0.05 = 5%) */
    readonly minMargin?: number;
    /** Most trade uses considered per trip, to bound the work (default 500) */
    readonly maxUses?: number;
    /** Emerald value of one unit of an item, used for ranking */
    readonly getValue?: ((name: string) => number | undefined) | undefined;
    /** Whether an item is a currency (emerald, diamond, coins); profit is preferably counted in one */
    readonly isCurrency?: ((name: string) => boolean) | undefined;
}

interface Offer {
    readonly trade: Trade;
    readonly lot: PairLot;
}

const DEFAULT_MIN_MARGIN = 0.05;
const DEFAULT_MAX_USES = 500;

function isSameShopOrOwner(a: Trade, b: Trade): boolean {
    if (a.x === b.x && a.y === b.y && a.z === b.z && a.world === b.world) { return true; }
    return a.shopOwner !== undefined && a.shopOwner.toLowerCase() === b.shopOwner?.toLowerCase();
}

interface Trip {
    readonly buyUses: number;
    readonly sellUses: number;
    readonly profit: number;
}

/**
 * Best number of uses for each leg. Trades are used whole, so the buy leg is
 * used often enough to cover what the sell leg takes; leftovers count as lost.
 * @param seller - Offer that gives the item for the currency
 * @param buyer - Offer that gives the currency for the item
 * @param maxUses - Cap on sell-leg uses
 * @returns Uses and profit of the best trip, or undefined if none is profitable
 */
function bestTrip(seller: Offer, buyer: Offer, maxUses: number): Trip | undefined {
    const itemsPerBuy = seller.lot.resultAmount;
    const pricePerBuy = seller.lot.costAmount;
    const itemsPerSell = buyer.lot.costAmount;
    const pricePerSell = buyer.lot.resultAmount;
    let best: Trip | undefined;

    const sellLimit = Math.min(buyer.trade.stock, maxUses);
    for (let sellUses = 1; sellUses <= sellLimit; sellUses++) {
        const buyUses = Math.ceil((sellUses * itemsPerSell) / itemsPerBuy);
        if (buyUses > seller.trade.stock) { break; }
        const profit = sellUses * pricePerSell - buyUses * pricePerBuy;
        if (profit > (best?.profit ?? 0)) { best = { buyUses, sellUses, profit }; }
    }
    return best;
}

function evaluateFlip(seller: Offer, buyer: Offer, options: FlipOptions): Flip | undefined {
    if (isSameShopOrOwner(seller.trade, buyer.trade)) { return undefined; }

    const costPerItem = seller.lot.costAmount / seller.lot.resultAmount;
    const paidPerItem = buyer.lot.resultAmount / buyer.lot.costAmount;
    const margin = paidPerItem / costPerItem - 1;
    if (margin < (options.minMargin ?? DEFAULT_MIN_MARGIN)) { return undefined; }

    const trip = bestTrip(seller, buyer, options.maxUses ?? DEFAULT_MAX_USES);
    if (!trip) { return undefined; }

    const currency = seller.lot.costName;
    const unitValue = options.getValue?.(currency);
    const { x: ax, z: az, world: aw } = seller.trade;
    const { x: bx, z: bz, world: bw } = buyer.trade;
    return {
        currency,
        margin,
        item: seller.lot.resultName,
        buy: { trade: seller.trade, uses: trip.buyUses, itemAmount: seller.lot.resultAmount, currencyAmount: seller.lot.costAmount },
        sell: { trade: buyer.trade, uses: trip.sellUses, itemAmount: buyer.lot.costAmount, currencyAmount: buyer.lot.resultAmount },
        profit: trip.profit,
        profitValue: unitValue === undefined ? undefined : unitValue * trip.profit,
        distance: calculateRouteDistance(ax, az, aw, bx, bz, bw),
    };
}

/**
 * The same two trades form a loop in both directions (diamonds → saplings →
 * diamonds and saplings → diamonds → saplings). Prefer counting the profit in
 * a currency, then in the more valuable item.
 * @param candidate - Newly found orientation
 * @param existing - Orientation found earlier
 * @param options - Value lookup and currency check
 * @returns True if the candidate should replace the existing flip
 */
function isBetterOrientation(candidate: Flip, existing: Flip, options: FlipOptions): boolean {
    const candidateIsCurrency = options.isCurrency?.(candidate.currency) ?? false;
    if (candidateIsCurrency !== (options.isCurrency?.(existing.currency) ?? false)) { return candidateIsCurrency; }
    const candidateValue = options.getValue?.(candidate.currency);
    const existingValue = options.getValue?.(existing.currency);
    if (candidateValue === undefined) { return false; }
    return existingValue === undefined || candidateValue > existingValue;
}

function compareFlips(a: Flip, b: Flip): number {
    if (a.profitValue !== undefined && b.profitValue !== undefined && a.profitValue !== b.profitValue) {
        return b.profitValue - a.profitValue;
    }
    if (a.profitValue !== undefined && b.profitValue === undefined) { return -1; }
    if (a.profitValue === undefined && b.profitValue !== undefined) { return 1; }
    return b.margin - a.margin;
}

function collectOffers(trades: readonly Trade[]): readonly Offer[] {
    const offers: Offer[] = [];
    for (const trade of trades) {
        if (trade.stock <= 0) { continue; }
        const lot = getPairPrice(trade);
        if (lot && lot.costAmount > 0 && lot.resultName.toLowerCase() !== lot.costName.toLowerCase()) {
            offers.push({ trade, lot });
        }
    }
    return offers;
}

/**
 * Find profitable round trips between two shops owned by different players.
 * Only in-stock, single-cost trades of identifiable items are used; each pair
 * of trades appears once, ranked by emerald value of the profit (flips in
 * currencies without a trusted value come last, by margin).
 *
 * @param trades - All trades
 * @param options - Margin threshold, work cap and value lookup
 * @returns Flips, most profitable first
 *
 * @example
 * // Shop A: 32 saplings for 1 emerald; shop B: 1 emerald for 2 saplings
 * findFlips(trades)[0] // { item: 'Oak sapling', currency: 'Emerald', profit: 15, ... }
 */
export function findFlips(trades: readonly Trade[], options: FlipOptions = {}): readonly Flip[] {
    const offers = collectOffers(trades);
    const sellersByPair = new Map<string, Offer[]>();
    for (const offer of offers) {
        const key = getPairKey(offer.lot.resultName, offer.lot.costName);
        const sellers = sellersByPair.get(key);
        if (sellers) {
            sellers.push(offer);
        } else {
            sellersByPair.set(key, [offer]);
        }
    }

    const flips = new Map<string, Flip>();
    for (const buyer of offers) {
        // The buyer pays its result (currency) for its cost (the item)
        const sellers = sellersByPair.get(getPairKey(buyer.lot.costName, buyer.lot.resultName)) ?? [];
        for (const seller of sellers) {
            const flip = evaluateFlip(seller, buyer, options);
            if (!flip) { continue; }
            const key = [getTradeKey(seller.trade), getTradeKey(buyer.trade)].toSorted((a, b) => a.localeCompare(b)).join('\u0000');
            const existing = flips.get(key);
            if (!existing || isBetterOrientation(flip, existing, options)) { flips.set(key, flip); }
        }
    }
    return [...flips.values()].toSorted(compareFlips);
}
