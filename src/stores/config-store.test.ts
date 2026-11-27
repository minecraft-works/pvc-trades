/**
 * Unit tests for src/stores/config-store.ts
 */
import { describe, expect, test } from 'vitest';

import { setupTestStores } from '../test-fixtures.js';
import { getConfig } from './config-store.js';

// Mock fetch and load block conversions, core blocks and config before tests run
setupTestStores();

describe('config loading', () => {
    test('getConfig returns config', () => {
        const config = getConfig();
        expect(config.squaremap.baseUrl).toBe('https://test.example.com/maps');
    });

    test('config has analysis settings', () => {
        const config = getConfig();
        expect(config.analysis.shopClusterDistance).toBe(16);
        expect(config.analysis.maxTransitiveIterations).toBe(10);
        expect(config.analysis.minIndependentShops).toBe(3);
    });
});
