/**
 * Pure logic functions - no DOM dependencies
 * These can be imported and unit tested directly
 */

import {
    type AppConfig,
    type BlockConversions,
    type Item,
    type MappingRule,
    type Recipe,
    type Shop,
    type Trade,
    type FilterResult,
    type SortColumn,
    type SortDirection,
    type Coordinates,
    type PriceEntry,
    type ItemValueEntry,
    type ItemValues,
    type RatioGraph,
    type ShulkerItem,
    type ShulkerParseResult,
    type NormalizeResult,
    type TrustedValueOptions,
    type TradeInput,
    AppConfigSchema,
    BlockConversionsSchema,
    DEFAULT_CONFIG
} from './types.js';

// ============================================================================
// Configuration Store
// ============================================================================

class ConfigStore {
    private config: AppConfig = DEFAULT_CONFIG;
    private loaded = false;

    get(): AppConfig {
        return this.config;
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    async load(): Promise<AppConfig> {
        try {
            const response = await fetch('config.json');
            if (!response.ok) {
                console.warn('Failed to load config, using defaults');
                return this.config;
            }
            const data: unknown = await response.json();
            const parsed = AppConfigSchema.safeParse(data);
            if (parsed.success) {
                this.config = parsed.data;
            } else {
                console.warn('Invalid config format, using defaults:', parsed.error);
            }
            this.loaded = true;
            return this.config;
        } catch (error) {
            console.warn('Error loading config, using defaults:', error);
            this.loaded = true;
            return this.config;
        }
    }

    // For testing purposes
    _setConfig(config: AppConfig): void {
        this.config = config;
        this.loaded = true;
    }
}

export const configStore = new ConfigStore();

// Convenience exports (delegate to store)
export function getConfig(): AppConfig {
    return configStore.get();
}

export async function loadConfig(): Promise<AppConfig> {
    return configStore.load();
}

// ============================================================================
// Core Blocks Store
// ============================================================================

class CoreBlocksStore {
    private blocks: string[] = [];

    get(): string[] {
        return this.blocks;
    }

    async load(): Promise<string[]> {
        try {
            const response = await fetch('core_currencies.json');
            if (!response.ok) {
                console.warn('Failed to load base items, using defaults');
                return this.blocks;
            }
            const data: unknown = await response.json();
            if (Array.isArray(data) && data.every(item => typeof item === 'string')) {
                this.blocks = data;
            }
            return this.blocks;
        } catch (error) {
            console.warn('Error loading base items:', error);
            return this.blocks;
        }
    }

    // For testing purposes
    _setBlocks(blocks: string[]): void {
        this.blocks = blocks;
    }
}

export const coreBlocksStore = new CoreBlocksStore();

export function getCoreBlocks(): string[] {
    return coreBlocksStore.get();
}

export async function loadBaseItems(): Promise<string[]> {
    return coreBlocksStore.load();
}

// ============================================================================
// Block Conversions Store
// ============================================================================

class BlockConversionsStore {
    private conversions: BlockConversions = {};

    get(): BlockConversions {
        return this.conversions;
    }

    async load(): Promise<BlockConversions> {
        try {
            const response = await fetch('block_conversions.json');
            if (!response.ok) {
                console.warn('Failed to load fixed ratios, using defaults');
                return this.conversions;
            }
            const data: unknown = await response.json();
            const parsed = BlockConversionsSchema.safeParse(data);
            if (parsed.success) {
                this.conversions = parsed.data;
            } else {
                console.warn('Invalid block conversions format:', parsed.error);
            }
            return this.conversions;
        } catch (error) {
            console.warn('Error loading block conversions:', error);
            return this.conversions;
        }
    }

    // For testing purposes
    _setConversions(conversions: BlockConversions): void {
        this.conversions = conversions;
    }
}

export const blockConversionsStore = new BlockConversionsStore();

export async function loadFixedRatios(): Promise<BlockConversions> {
    return blockConversionsStore.load();
}

// ============================================================================
// Query Matching Functions
// ============================================================================

const normalizeCache = new Map<string, string>();

function normalize(s: string): string {
    const cached = normalizeCache.get(s);
    if (cached !== undefined) { return cached; }
    const result = s.replaceAll('_', ' ').replaceAll(' ', '');
    normalizeCache.set(s, result);
    return result;
}

export function matchesQuery(text: string, query: string): boolean {
    const textNorm = normalize(text);
    const queryNorm = normalize(query);
    if (textNorm.includes(queryNorm)) { return true; }

    const words = query.replaceAll('_', ' ').split(/\s+/).filter(Boolean);
    return words.every(word => text.includes(word));
}

export function enchantsMatch(
    itemEnchants: Record<string, number> | undefined,
    ruleEnchants: Record<string, number> | undefined
): boolean {
    if (!itemEnchants || !ruleEnchants) { return false; }
    for (const [key, val] of Object.entries(ruleEnchants)) {
        if (itemEnchants[key] !== val) { return false; }
    }
    return true;
}

// ============================================================================
// Formatting Functions
// ============================================================================

export function formatName(item: Item): string {
    const text = item.name || item.type.replaceAll('_', ' ');
    if (!text) { return ''; }
    const lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function applyMapping(item: Item | undefined, mappingRules: MappingRule[]): void {
    if (!item) { return; }
    const type = item.type.replace('minecraft:', '').toUpperCase();

    for (const rule of mappingRules) {
        if (rule.item !== type) { continue; }
        if (rule.originalName && item.name !== rule.originalName) { continue; }
        if (rule.enchant && !enchantsMatch(item.enchant, rule.enchant)) { continue; }

        item.type = rule.customName;
        item.name = '';
        return;
    }
}

export function getRegex(pattern: string): RegExp {
    const withPlaceholder = pattern.replaceAll('*', '\x00');
    const escaped = withPlaceholder.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`);
    const chars = [...escaped];
    const flexible = chars.join('[_ ]*');
    return new RegExp(flexible.replaceAll('\x00', '.*'), 'i');
}

// ============================================================================
// Shulker Box Parsing
// ============================================================================

export function parseShulkerContents(lore: string[]): ShulkerParseResult {
    const counts: Record<string, number> = {};
    for (const line of lore) {
        const match = line.match(/-\s*(\d+)x\s+(.+)/i);
        if (match && match[1] && match[2]) {
            const amt = Number.parseInt(match[1], 10);
            const item = match[2].trim();
            counts[item] = (counts[item] || 0) + amt;
        }
    }

    const items: ShulkerItem[] = Object.entries(counts).map(([key, total]) => {
        const formatted = key.replaceAll('_', ' ').toLowerCase();
        return {
            key: key.toLowerCase(),
            name: formatted.charAt(0).toUpperCase() + formatted.slice(1),
            total
        };
    });

    items.sort((a, b) => b.total - a.total);

    if (items.length === 0) {
        return { items: [], defaultName: 'Shulker box', defaultTotal: 1 };
    }

    const firstItem = items[0]!;
    return { items, defaultName: firstItem.name, defaultTotal: firstItem.total };
}

// ============================================================================
// HTML Utilities
// ============================================================================

const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

export function escapeHtml(text: string): string {
    return text.replaceAll(/[&<>"']/g, c => HTML_ESCAPE_MAP[c] ?? c);
}

export function highlight(text: string, regex: RegExp): string {
    const escaped = escapeHtml(text);
    return escaped.replace(regex, m => `<mark>${m}</mark>`);
}

// ============================================================================
// Location & Distance Functions
// ============================================================================

export function parseLocation(location: string): Coordinates {
    const coords = location.split(', ');
    return {
        x: Number.parseFloat(coords[0] ?? '0') || 0,
        y: Number.parseFloat(coords[1] ?? '0') || 0,
        z: Number.parseFloat(coords[2] ?? '0') || 0
    };
}

// ============================================================================
// Trade Processing
// ============================================================================

export function processTrade(recipe: Recipe, shop: Shop, mappingRules: MappingRule[]): Trade {
    const { x, y, z } = parseLocation(shop.location);
    const world = shop.world.replace('minecraft:', '');

    applyMapping(recipe.resultItem, mappingRules);
    applyMapping(recipe.item1, mappingRules);
    if (recipe.item2) { applyMapping(recipe.item2, mappingRules); }

    const lore = recipe.resultItem.lore || [];
    let resultName: string;
    let resultAmount: number;
    let loreText = '';
    let isShulker = false;
    let shulkerItems: ShulkerItem[] | null = null;

    if (lore.length > 0 && recipe.resultItem.type.includes('SHULKER')) {
        const parsed = parseShulkerContents(lore);
        resultName = parsed.defaultName;
        resultAmount = parsed.defaultTotal;
        shulkerItems = parsed.items;
        loreText = lore.join(' ').toLowerCase();
        isShulker = true;
    } else {
        resultName = formatName(recipe.resultItem);
        resultAmount = recipe.resultItem.amount;
    }

    const costName = formatName(recipe.item1) + (recipe.item2 ? ' ' + formatName(recipe.item2) : '');
    const displayStock = isShulker ? recipe.stock * resultAmount : recipe.stock;

    return {
        x, y, z, world,
        item1: recipe.item1,
        item2: recipe.item2,
        resultItem: recipe.resultItem,
        stock: recipe.stock,
        displayStock,
        resultText: resultName.toLowerCase(),
        costText: costName.toLowerCase(),
        loreText,
        shulkerItems,
        resultName,
        resultAmount,
        costName
    };
}

// ============================================================================
// Trade Filtering
// ============================================================================

export function filterTrade(trade: Trade, wantQuery: string, giveQuery: string): FilterResult | null {
    if (trade.stock === 0) { return null; }

    let matchResult = false;
    let displayName = trade.resultName;
    let displayAmount = trade.resultAmount;

    if (wantQuery) {
        if (matchesQuery(trade.resultText, wantQuery)) {
            matchResult = true;
        } else if (trade.shulkerItems) {
            const matched = trade.shulkerItems.find(item =>
                matchesQuery(item.key, wantQuery) || matchesQuery(item.name.toLowerCase(), wantQuery)
            );
            if (matched) {
                matchResult = true;
                displayName = matched.name;
                displayAmount = matched.total;
            }
        }
    } else {
        matchResult = true;
    }

    const matchCost = giveQuery ? matchesQuery(trade.costText, giveQuery) : true;

    if (wantQuery && !matchResult) { return null; }
    if (giveQuery && !matchCost) { return null; }

    return {
        trade,
        matchResult: Boolean(wantQuery && matchResult),
        matchCost: Boolean(giveQuery && matchCost),
        displayName,
        displayAmount
    };
}

// ============================================================================
// Sorting
// ============================================================================

export function sortResults(
    results: FilterResult[],
    column: SortColumn,
    direction: SortDirection
): FilterResult[] {
    const dir = direction === 'asc' ? 1 : -1;

    results.sort((a, b) => {
        const ta = a.trade;
        const tb = b.trade;
        let av: number;
        let bv: number;

        switch (column) {
            case 'cost-amt':
                av = ta.item1.amount + (ta.item2?.amount || 0);
                bv = tb.item1.amount + (tb.item2?.amount || 0);
                break;
            case 'cost-name':
                return dir * ta.costName.localeCompare(tb.costName);
            case 'result-amt':
                av = ta.resultAmount;
                bv = tb.resultAmount;
                break;
            case 'result-name':
                return dir * ta.resultName.localeCompare(tb.resultName);
            case 'stock':
                av = ta.displayStock;
                bv = tb.displayStock;
                break;
            case 'world':
                return dir * ta.world.localeCompare(tb.world);
            case 'distance':
                av = Math.hypot(ta.x, ta.z);
                bv = Math.hypot(tb.x, tb.z);
                break;
            default:
                return 0;
        }
        return dir * (av - bv);
    });

    return results;
}

// ============================================================================
// Ratio Graph
// ============================================================================

/**
 * Build a ratio graph for the core blocks
 * Combines: fixed ratios (block↔ingot), shop trades, and transitive deductions
 * Returns: Map of "itemA->itemB" => ratio (1 itemA = ratio itemB)
 */
export function buildRatioGraph(itemValues: ItemValues): RatioGraph {
    const graph: RatioGraph = new Map();
    const coreBlocks = coreBlocksStore.get();
    const blockConversions = blockConversionsStore.get();
    const coreBlocksLower = coreBlocks.map(b => b.toLowerCase());

    function addRatio(from: string, to: string, ratio: number): void {
        if (ratio === null || ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) { return; }
        const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
        const reverseKey = `${to.toLowerCase()}->${from.toLowerCase()}`;

        if (!graph.has(key)) {
            graph.set(key, ratio);
            graph.set(reverseKey, 1 / ratio);
        }
    }

    // Get emerald values for all items from itemValues
    const emeraldValues = new Map<string, number>();

    for (const [key, entry] of itemValues.entries()) {
        const medianBuy = median(entry.buyPrices);
        const medianSell = median(entry.sellPrices);
        let value: number | null = null;
        if (medianBuy !== null && medianSell !== null) {
            value = (medianBuy + medianSell) / 2;
        } else {
            value = medianBuy ?? medianSell;
        }
        if (value !== null) {
            emeraldValues.set(key, value);
        }
    }

    // Emerald itself has value 1
    emeraldValues.set('emerald', 1);

    // Add block values from their ingot values using fixed multipliers
    for (const [blockName, { base, multiplier }] of Object.entries(blockConversions)) {
        const baseValue = emeraldValues.get(base.toLowerCase());
        if (baseValue !== null && baseValue !== undefined) {
            emeraldValues.set(blockName.toLowerCase(), baseValue * multiplier);
        }
    }

    // Calculate ratios between all core blocks using their emerald values
    for (const blockA of coreBlocksLower) {
        const valueA = emeraldValues.get(blockA);
        if (valueA === null || valueA === undefined) { continue; }

        for (const blockB of coreBlocksLower) {
            if (blockA === blockB) { continue; }
            const valueB = emeraldValues.get(blockB);
            if (valueB === null || valueB === undefined) { continue; }

            // 1 blockA = (valueA / valueB) blockB
            addRatio(blockA, blockB, valueA / valueB);
        }
    }

    return graph;
}

/**
 * Get the ratio between two items from the ratio graph
 * Returns null if no path exists
 */
export function getRatio(graph: RatioGraph, from: string, to: string): number | null {
    const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
    return graph.get(key) ?? null;
}

// ============================================================================
// Item Value Calculation
// ============================================================================

function normalizeToBaseCurrency(
    itemName: string,
    amount: number,
    baseCurrency: string
): NormalizeResult {
    const blockConversions = blockConversionsStore.get();
    const itemNorm = itemName.toLowerCase();
    const baseNorm = baseCurrency.toLowerCase();

    // Direct match
    if (itemNorm === baseNorm) {
        return { matches: true, amount };
    }

    // Check if item is a block version of base currency
    const blockInfo = blockConversions[itemNorm];
    if (blockInfo && blockInfo.base.toLowerCase() === baseNorm) {
        return { matches: true, amount: amount * blockInfo.multiplier };
    }

    // Check if base is a block and item is its single version
    const baseBlockInfo = blockConversions[baseNorm];
    if (baseBlockInfo && baseBlockInfo.base.toLowerCase() === itemNorm) {
        return { matches: true, amount: amount / baseBlockInfo.multiplier };
    }

    return { matches: false, amount };
}

function addValue(
    values: ItemValues,
    item: string,
    price: number,
    type: 'buy' | 'sell',
    x: number,
    y: number,
    z: number
): void {
    const key = item.toLowerCase();
    if (!values.has(key)) {
        values.set(key, { name: item, buyPrices: [], sellPrices: [] });
    }
    const entry = values.get(key)!;
    const priceObj: PriceEntry = { price, x, y, z };
    if (type === 'buy') {
        entry.buyPrices.push(priceObj);
    } else {
        entry.sellPrices.push(priceObj);
    }
}

/**
 * Calculate item values including transitive derivation through intermediaries
 */
export function calculateItemValues(trades: TradeInput[], baseCurrency: string): ItemValues {
    const config = configStore.get();
    const values: ItemValues = new Map();

    // Phase 1: Direct trades with base currency
    for (const trade of trades) {
        if (trade.item2) { continue; }

        const costAsBase = normalizeToBaseCurrency(trade.costName, trade.costAmount, baseCurrency);
        const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, baseCurrency);

        if (costAsBase.matches === resultAsBase.matches) { continue; }

        if (costAsBase.matches) {
            const pricePerItem = costAsBase.amount / trade.resultAmount;
            addValue(values, trade.resultName, pricePerItem, 'buy', trade.x, trade.y, trade.z);
        } else if (resultAsBase.matches) {
            const pricePerItem = resultAsBase.amount / trade.costAmount;
            addValue(values, trade.costName, pricePerItem, 'sell', trade.x, trade.y, trade.z);
        }
    }

    // Phase 2: Extend using known item values as intermediaries
    let changed = true;
    let iterations = 0;

    while (changed && iterations < config.analysis.maxTransitiveIterations) {
        changed = false;
        iterations++;

        for (const trade of trades) {
            if (trade.item2) { continue; }

            const costKey = trade.costName.toLowerCase();
            const resultKey = trade.resultName.toLowerCase();

            const costIsBase = normalizeToBaseCurrency(trade.costName, 1, baseCurrency).matches;
            const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, baseCurrency).matches;
            if (costIsBase || resultIsBase) { continue; }

            const costEntry = values.get(costKey);
            const resultEntry = values.get(resultKey);

            // Cost is known and trusted, result is unknown → derive result's buy price
            if (costEntry && !resultEntry) {
                const costValue = getTrustedItemValue(trade.costName, values);
                if (costValue !== null) {
                    const totalCost = trade.costAmount * costValue;
                    const pricePerResult = totalCost / trade.resultAmount;
                    addValue(values, trade.resultName, pricePerResult, 'buy', trade.x, trade.y, trade.z);
                    changed = true;
                }
            }

            // Result is known and trusted, cost is unknown → derive cost's sell price
            if (resultEntry && !costEntry) {
                const resultValue = getTrustedItemValue(trade.resultName, values);
                if (resultValue !== null) {
                    const totalResult = trade.resultAmount * resultValue;
                    const pricePerCost = totalResult / trade.costAmount;
                    addValue(values, trade.costName, pricePerCost, 'sell', trade.x, trade.y, trade.z);
                    changed = true;
                }
            }
        }
    }

    return values;
}

// ============================================================================
// Statistical Functions
// ============================================================================

/**
 * Calculate median of price values (extracts .price from objects if needed)
 */
export function median(arr: PriceEntry[] | number[]): number | null {
    if (arr.length === 0) { return null; }
    const prices = arr.map(p => typeof p === 'object' ? p.price : p);
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) {
        return sorted[mid]!;
    }
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Count independent shops (>shopClusterDistance blocks apart) for a price array
 */
export function countIndependentShops(priceArray: PriceEntry[]): number {
    const config = configStore.get();
    if (priceArray.length === 0) { return 0; }

    const locations = priceArray
        .filter(p => p && p.x !== undefined && p.y !== undefined && p.z !== undefined)
        .map(p => ({ x: p.x, y: p.y, z: p.z }));

    if (locations.length === 0) { return priceArray.length; }

    const clusters: Coordinates[] = [];
    for (const loc of locations) {
        let foundCluster = false;
        for (const cluster of clusters) {
            const dist = Math.hypot(loc.x - cluster.x, loc.y - cluster.y, loc.z - cluster.z);
            if (dist <= config.analysis.shopClusterDistance) {
                foundCluster = true;
                break;
            }
        }
        if (!foundCluster) {
            clusters.push(loc);
        }
    }
    return clusters.length;
}

/**
 * Check if an item has enough independent shops (>=minShops) for its data to be trusted
 */
export function hasEnoughIndependentData(entry: ItemValueEntry, minShops?: number): boolean {
    const config = configStore.get();
    const threshold = minShops ?? config.analysis.minIndependentShops;
    const buyIndependent = countIndependentShops(entry.buyPrices);
    const sellIndependent = countIndependentShops(entry.sellPrices);
    return Math.max(buyIndependent, sellIndependent) >= threshold;
}

/**
 * Get trusted emerald value for an item.
 * For core blocks, requires >=minShops independent shops.
 * Falls back to block conversions if direct value unavailable.
 */
export function getTrustedItemValue(
    itemName: string,
    itemValues: ItemValues,
    options: TrustedValueOptions = {}
): number | null {
    const { minShops = 3 } = options;
    const blockConversions = blockConversionsStore.get();
    const coreBlocks = coreBlocksStore.get();
    const itemKey = itemName.toLowerCase();

    // Emerald is always 1
    if (itemKey === 'emerald') { return 1; }
    if (itemKey === 'emerald block') { return 9; }

    const coreBlocksLower = coreBlocks.map(b => b.toLowerCase());
    const isCoreBlock = coreBlocksLower.includes(itemKey);

    // Check direct value from trades
    const entry = itemValues.get(itemKey);
    if (entry) {
        if (isCoreBlock && !hasEnoughIndependentData(entry, minShops)) {
            // Don't trust, fall through to conversion fallback
        } else {
            const buy = median(entry.buyPrices);
            const sell = median(entry.sellPrices);
            if (buy !== null || sell !== null) {
                if (buy !== null && sell !== null) { return (buy + sell) / 2; }
                return buy ?? sell;
            }
        }
    }

    // Fall back to block conversions (block = ingot × multiplier)
    const blockInfo = blockConversions[itemKey];
    if (blockInfo) {
        const baseEntry = itemValues.get(blockInfo.base.toLowerCase());
        if (baseEntry && (!isCoreBlock || hasEnoughIndependentData(baseEntry, minShops))) {
            const baseBuy = median(baseEntry.buyPrices);
            const baseSell = median(baseEntry.sellPrices);
            const baseValue = baseBuy ?? baseSell;
            if (baseValue !== null) {
                return baseValue * blockInfo.multiplier;
            }
        }
    }

    // Try reverse conversion (ingot from block)
    for (const [blockKey, conv] of Object.entries(blockConversions)) {
        if (conv.base.toLowerCase() === itemKey) {
            const blockEntry = itemValues.get(blockKey);
            if (blockEntry && (!isCoreBlock || hasEnoughIndependentData(blockEntry, minShops))) {
                const blockBuy = median(blockEntry.buyPrices);
                const blockSell = median(blockEntry.sellPrices);
                const blockValue = blockBuy ?? blockSell;
                if (blockValue !== null) {
                    return blockValue / conv.multiplier;
                }
            }
        }
    }

    return null;
}

// ============================================================================
// Map Utilities
// ============================================================================

/**
 * Get world ID for tile URL from world name
 */
export function getWorldId(world: string): string {
    if (world.includes('nether')) {
        return 'the_nether';
    }
    if (world.includes('end')) {
        return 'the_end';
    }
    return 'overworld';
}

/**
 * Calculate which tile contains the given coordinates
 */
export function getTileCoords(x: number, z: number, tileSize: number = 512): { tileX: number; tileZ: number } {
    return {
        tileX: Math.floor(x / tileSize),
        tileZ: Math.floor(z / tileSize)
    };
}

/**
 * Calculate offset within a tile (0 to tileSize-1)
 */
export function getTileOffset(x: number, z: number, tileSize: number = 512): { offsetX: number; offsetZ: number } {
    const { tileX, tileZ } = getTileCoords(x, z, tileSize);
    return {
        offsetX: x - tileX * tileSize,
        offsetZ: z - tileZ * tileSize
    };
}

/**
 * Calculate zoom level needed to fit a given size in a container
 * In CRS.Simple: pixels = units × 2^zoom
 */
export function calculateFitZoom(containerSize: number, contentSize: number): number {
    return Math.log2(containerSize / contentSize);
}

/**
 * Convert Minecraft coordinates to Leaflet CRS.Simple latLng
 * In CRS.Simple, lat = y (negative for down), lng = x
 */
export function toLeafletCoords(
    x: number,
    z: number,
    tileSize: number = 512
): { lat: number; lng: number } {
    const { offsetX, offsetZ } = getTileOffset(x, z, tileSize);
    return {
        lat: -offsetZ,  // Invert Z for screen coords (negative = down)
        lng: offsetX
    };
}

/**
 * Convert Minecraft world coordinates to Leaflet coords relative to a center tile.
 * Used for placing markers (like players) relative to a shop's tile.
 */
export function toLeafletCoordsRelative(
    x: number,
    z: number,
    centerTileX: number,
    centerTileZ: number,
    tileSize: number = 512
): { lat: number; lng: number } {
    // Calculate the block offset from the center tile's origin
    const centerOriginX = centerTileX * tileSize;
    const centerOriginZ = centerTileZ * tileSize;
    
    const relativeX = x - centerOriginX;
    const relativeZ = z - centerOriginZ;
    
    return {
        lat: -relativeZ,  // Invert Z for screen coords
        lng: relativeX
    };
}

/**
 * Convert Leaflet coords back to Minecraft world coordinates relative to a center tile.
 * Inverse of toLeafletCoordsRelative.
 */
export function fromLeafletCoordsRelative(
    lat: number,
    lng: number,
    centerTileX: number,
    centerTileZ: number,
    tileSize: number = 512
): { x: number; z: number } {
    const centerOriginX = centerTileX * tileSize;
    const centerOriginZ = centerTileZ * tileSize;
    
    return {
        x: Math.round(lng + centerOriginX),
        z: Math.round(-lat + centerOriginZ)  // Invert back from screen coords
    };
}

/**
 * Clamp a point to the edge of a circle if it's outside.
 * Returns the original point if inside, or the nearest point on the circle edge if outside.
 * 
 * @param lat - Latitude (y coordinate)
 * @param lng - Longitude (x coordinate) 
 * @param centerLat - Circle center latitude
 * @param centerLng - Circle center longitude
 * @param radius - Circle radius in coordinate units
 * @returns The clamped coordinates and whether the point was outside
 */
export function clampToCircle(
    lat: number,
    lng: number,
    centerLat: number,
    centerLng: number,
    radius: number
): { lat: number; lng: number; clamped: boolean } {
    const dx = lng - centerLng;
    const dy = lat - centerLat;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance <= radius) {
        return { lat, lng, clamped: false };
    }
    
    // Normalize and scale to circle edge
    const scale = radius / distance;
    return {
        lat: centerLat + dy * scale,
        lng: centerLng + dx * scale,
        clamped: true
    };
}
