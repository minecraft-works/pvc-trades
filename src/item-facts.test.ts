import { describe, expect, it } from 'vitest';

import { cleanLoreLine, getItemFacts, isCosmeticEnchant } from './item-facts.js';
import type { Item } from './types.js';

const block = (name: string, lore: readonly string[]): Item => ({ type: 'COAL_ORE', amount: 1, name, lore });

describe('cleanLoreLine', () => {
    it('removes colour codes and the bullet', () => {
        expect(cleanLoreLine('§7• §6Will protect 32x32 blocks.')).toBe('Will protect 32x32 blocks.');
        expect(cleanLoreLine('§6§oWrite §6§o/claim§6 for a list')).toBe('Write /claim for a list');
    });

    it('keeps plain lines', () => {
        expect(cleanLoreLine('Use it to buy a claim block at the spawn.')).toBe('Use it to buy a claim block at the spawn.');
    });
});

describe('getItemFacts', () => {
    it('reads the protected area from old and new lore styles', () => {
        const legacy = block('Standard Protection Block', ['§7• §6Will protect 32x32 blocks.', '§8• §6Place this to claim your builds.']);
        const modern = block('Standard Protection Block', ['• Will protect 32x32 blocks.']);
        expect(getItemFacts(legacy)).toEqual({ tags: ['32x32'], searchText: '32x32' });
        expect(getItemFacts(modern)).toEqual(getItemFacts(legacy));
    });

    it('adds the world restriction', () => {
        const nether = block('Nether Protection Block', ['• Will protect 24x24 blocks.', '• Does not work in the Overworld.']);
        expect(getItemFacts(nether)).toEqual({ tags: ['24x24', 'Nether only'], searchText: '24x24 nether only' });
    });

    it('recognises a chunk block', () => {
        const chunk = block('Mini', ['• Will protect an entire world chunk.']);
        expect(getItemFacts(chunk).tags).toEqual(['Chunk']);
    });

    it('does not repeat what the name already says, but keeps it searchable', () => {
        const sixteen = block('16x16 Protection Block', ['§6Will protect 16x16 blocks.']);
        expect(getItemFacts(sixteen)).toEqual({ tags: [], searchText: '16x16' });
        expect(getItemFacts(block('Chunk Protection Block', ['• Will protect an entire world chunk.'])).tags).toEqual([]);
    });

    it('ignores items without such lore and shulker contents', () => {
        expect(getItemFacts({ type: 'DIAMOND', name: '', amount: 1 }).tags).toEqual([]);
        expect(getItemFacts(block('Cert', ['Use it to buy a claim block at the spawn.'])).searchText).toBe('');
        expect(getItemFacts({ type: 'SHULKER_BOX', name: '', amount: 1, lore: ['- 64x SAND'] }).searchText).toBe('');
    });
});

describe('isCosmeticEnchant', () => {
    it('treats lure as a glint except on a fishing rod', () => {
        expect(isCosmeticEnchant('COAL_ORE', 'minecraft:lure')).toBe(true);
        expect(isCosmeticEnchant('FISHING_ROD', 'minecraft:lure')).toBe(false);
        expect(isCosmeticEnchant('minecraft:fishing_rod', 'lure')).toBe(false);
    });

    it('leaves other enchantments alone', () => {
        expect(isCosmeticEnchant('COAL_ORE', 'minecraft:efficiency')).toBe(false);
    });
});
