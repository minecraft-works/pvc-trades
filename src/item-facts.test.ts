import { describe, expect, it } from 'vitest';

import { cleanLoreLine, getItemFacts, isCosmeticEnchant, withoutLeadingSize } from './item-facts.js';
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
        expect(getItemFacts(legacy)).toEqual({ size: '32x32', restriction: undefined, searchText: '32x32' });
        expect(getItemFacts(modern)).toEqual(getItemFacts(legacy));
    });

    it('adds the world restriction', () => {
        const nether = block('Nether Protection Block', ['• Will protect 24x24 blocks.', '• Does not work in the Overworld.']);
        expect(getItemFacts(nether)).toEqual({ size: '24x24', restriction: 'Nether only', searchText: '24x24 nether only' });
    });

    it('recognises a chunk block', () => {
        const chunk = block('Claim', ['• Will protect an entire world chunk.']);
        expect(getItemFacts(chunk).size).toBe('Chunk');
    });

    it('reports the size of a block whose name starts with it', () => {
        expect(getItemFacts(block('16x16 Protection Block', ['§6Will protect 16x16 blocks.']))).toEqual({ size: '16x16', restriction: undefined, searchText: '16x16' });
        expect(getItemFacts(block('Chunk Protection Block', ['• Will protect an entire world chunk.'])).size).toBe('Chunk');
    });

    it('ignores items without such lore and shulker contents', () => {
        expect(getItemFacts({ type: 'DIAMOND', name: '', amount: 1 }).size).toBeUndefined();
        expect(getItemFacts(block('Cert', ['Use it to buy a claim block at the spawn.'])).searchText).toBe('');
        expect(getItemFacts({ type: 'SHULKER_BOX', name: '', amount: 1, lore: ['- 64x SAND'] }).searchText).toBe('');
    });
});

describe('withoutLeadingSize', () => {
    it('drops the size a name starts with', () => {
        expect(withoutLeadingSize('16x16 protection block', '16x16')).toBe('protection block');
        expect(withoutLeadingSize('Chunk protection block', 'Chunk')).toBe('protection block');
    });

    it('keeps names that do not start with the size as a separate word', () => {
        expect(withoutLeadingSize('Standard protection block', '32x32')).toBe('Standard protection block');
        expect(withoutLeadingSize('16x160 block', '16x16')).toBe('16x160 block');
        expect(withoutLeadingSize('16x16', '16x16')).toBe('16x16');
        expect(withoutLeadingSize('Diamond', undefined)).toBe('Diamond');
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
