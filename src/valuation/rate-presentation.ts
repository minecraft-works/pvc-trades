/**
 * Rate Presentation
 *
 * Turns currency-graph quotes into amounts people think in (ADR-019): the
 * more valuable currency comes first so amounts are at least 1, large
 * amounts and whole numbers of blocks are shown in blocks ("1 Netherite
 * ingot = 16 Diamond block", never "0.06 Netherite ingot"), and numbers are
 * rounded to what matters.
 *
 * @module valuation/rate-presentation
 */

import { blockConversionsStore } from '../stores/index.js';
import type { CurrencyGraph } from './currency-graph.js';

/** A rate ready to display: 1 `item` = `buy` / `sell` `unit` */
export interface DisplayRate {
    /** Currency of which one unit is priced */
    readonly item: string;
    /** Currency the price is expressed in (may be a block) */
    readonly unit: string;
    readonly buy: number | undefined;
    readonly sell: number | undefined;
    /** Currencies passed through when there is no direct market */
    readonly via: readonly string[];
    /** Buy and sell crossed and both show the mid rate */
    readonly crossed: boolean;
}

/** From this many base units, a price reads better in blocks */
const BLOCK_DISPLAY_THRESHOLD = 64;
/** Relative distance to a whole number that still counts as that whole number */
const SNAP_TOLERANCE = 0.02;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/**
 * The block that crafts back into a base item, if any
 * @param base - Base item name
 * @returns Block name and its size in base units
 *
 * @example
 * getBlockOf('Diamond') // { name: 'Diamond block', multiplier: 9 }
 */
export function getBlockOf(base: string): { readonly name: string; readonly multiplier: number } | undefined {
    const baseKey = base.toLowerCase();
    for (const [block, conversion] of Object.entries(blockConversionsStore.get())) {
        if (conversion.reversible !== false && conversion.base.toLowerCase() === baseKey) {
            return { name: capitalize(block), multiplier: conversion.multiplier };
        }
    }
    return undefined;
}

function isWholeMultiple(value: number, multiplier: number): boolean {
    const blocks = value / multiplier;
    return blocks >= 1 && Math.abs(blocks - Math.round(blocks)) <= SNAP_TOLERANCE * blocks;
}

/**
 * Whether amounts of a currency read better in its block
 * @param values - Amounts in base units (all must qualify for whole blocks)
 * @param typical - Typical amount, compared with the block threshold
 * @param multiplier - Block size in base units
 * @returns True to show blocks
 */
function prefersBlock(values: readonly number[], typical: number, multiplier: number): boolean {
    return typical >= BLOCK_DISPLAY_THRESHOLD || (values.length > 0 && values.every(value => isWholeMultiple(value, multiplier)));
}

/**
 * Express an amount of a currency in the unit people think in: blocks for
 * large amounts or whole numbers of blocks, otherwise the base item.
 *
 * @param amount - Amount in base units
 * @param currency - Currency name (base unit)
 * @returns Amount and unit to show
 *
 * @example
 * presentAmount(144, 'Emerald') // { amount: 16, unit: 'Emerald block' }
 * presentAmount(13, 'Emerald')  // { amount: 13, unit: 'Emerald' }
 */
export function presentAmount(amount: number, currency: string): { readonly amount: number; readonly unit: string } {
    const block = getBlockOf(currency);
    if (!block || !prefersBlock([amount], amount, block.multiplier)) { return { amount, unit: currency }; }
    return { amount: amount / block.multiplier, unit: block.name };
}

/**
 * Rate between two currencies as it should be shown: the more valuable one
 * first, in blocks when the amount is large or a whole number of blocks.
 *
 * @param graph - Currency graph
 * @param a - One currency (base unit)
 * @param b - The other currency (base unit)
 * @returns Display rate, or undefined when there is no trusted rate
 *
 * @example
 * presentRate(graph, 'Diamond', 'Netherite ingot')
 * // { item: 'Netherite ingot', unit: 'Diamond block', buy: 16, sell: 8, via: [], crossed: false }
 */
export function presentRate(graph: CurrencyGraph, a: string, b: string): DisplayRate | undefined {
    const forward = graph.quote(a, b);
    if (!forward) { return undefined; }
    const [item, unit] = forward.mid < 1 ? [b, a] : [a, b];
    const quote = item === a ? forward : graph.quote(item, unit);
    if (!quote) { return undefined; }

    const block = getBlockOf(unit);
    const sides = [quote.buy, quote.sell].filter((value): value is number => value !== undefined);
    const useBlock = block !== undefined && prefersBlock(sides, quote.mid, block.multiplier);
    const scale = useBlock ? block.multiplier : 1;
    return {
        item,
        unit: useBlock ? block.name : unit,
        buy: quote.buy === undefined ? undefined : quote.buy / scale,
        sell: quote.sell === undefined ? undefined : quote.sell / scale,
        via: quote.via,
        crossed: quote.crossed,
    };
}

/**
 * Format an amount for display: whole numbers from 10, two significant
 * digits below, and values within 2% of a whole number shown as that number.
 *
 * @param value - Amount, or undefined when unknown
 * @returns Formatted amount, or a dash
 *
 * @example
 * formatAmount(17.2)   // '17'
 * formatAmount(5.22)   // '5.2'
 * formatAmount(7.95)   // '8'
 * formatAmount(1728)   // '1,728'
 */
export function formatAmount(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) { return '\u2014'; }
    const whole = Math.round(value);
    if (value >= 10 || (whole > 0 && Math.abs(value - whole) <= SNAP_TOLERANCE * value)) {
        return whole.toLocaleString('en-US');
    }
    return value.toLocaleString('en-US', { maximumSignificantDigits: 2 });
}

/**
 * Display name of a currency: first letter capitalised, without the
 * enchantment signature that only serves to tell items apart
 * @param name - Valuation name, e.g. "Bb coin [loyalty 10]"
 * @returns Name as shown, e.g. "Bb coin"
 */
export function currencyDisplayName(name: string): string {
    const signatureStart = name.indexOf(' [');
    return capitalize(signatureStart === -1 ? name : name.slice(0, signatureStart));
}
