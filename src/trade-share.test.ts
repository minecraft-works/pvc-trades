import { describe, expect, test } from 'vitest';

import { createTrade, plainItem } from './test-fixtures.js';
import { formatChatMessage, formatCoordinates } from './trade-share.js';
import type { Trade } from './types.js';

const located = (trade: Trade, overrides: Partial<Trade>): Trade => ({ ...trade, x: 120, y: 64, z: -300, ...overrides });
const resultFor = (trade: Trade) => ({ trade, displayName: trade.resultName, displayAmount: trade.resultAmount });

describe('formatCoordinates', () => {
    test('lists x, y and z separated by spaces', () => {
        expect(formatCoordinates(located(createTrade(1, 1, 'Diamond', 1), {}))).toBe('120 64 -300');
    });
});

describe('formatChatMessage', () => {
    test('names the owner, the deal and the location', () => {
        const trade = located(createTrade(1, 1, 'Diamond', 1), { shopOwner: 'ValeriaShares' });
        expect(formatChatMessage(resultFor(trade))).toBe('ValeriaShares sells 1 Diamond for 1 Emerald at 120, 64, -300');
    });

    test('does not name an unknown owner', () => {
        const trade = located(createTrade(4, 2, 'Diamond', 1), {});
        expect(formatChatMessage(resultFor(trade))).toBe('Selling 4 Diamond for 2 Emerald at 120, 64, -300');
    });

    test('lists both cost items', () => {
        const trade = located(createTrade(1, 1, 'Elytra', 1), { item2: plainItem('DIAMOND', 3) });
        expect(formatChatMessage(resultFor(trade))).toContain('for 1 Emerald + 3 Diamond at');
    });

    test('uses the displayed name and amount, such as a shulker box\'s contents', () => {
        const trade = located(createTrade(1, 1, 'Shulker Box', 1), {});
        expect(formatChatMessage({ trade, displayName: 'Cobblestone', displayAmount: 1728 })).toContain('Selling 1728 Cobblestone for');
    });

    test('names the dimension outside the overworld', () => {
        expect(formatChatMessage(resultFor(located(createTrade(1, 1, 'Diamond', 1, 'the_nether'), {})))).toMatch(/in the Nether$/);
        expect(formatChatMessage(resultFor(located(createTrade(1, 1, 'Diamond', 1, 'the_end'), {})))).toMatch(/in the End$/);
    });
});
