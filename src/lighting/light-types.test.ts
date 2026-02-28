import { describe, expect, test } from 'vitest';

import {
    ATLAS_MARGIN_BLOCKS,
    createLightingState,
    DEFAULT_LIGHT_CONFIG,
    MAX_POINT_LIGHTS,
    NIGHT_LIGHT_CONFIG,
    RESOLUTION_SCALE,
    toggleDayNight,
    TORCH_LIGHT_DEFAULTS,
} from './light-types.js';

describe('createLightingState', () => {
    test('returns daytime config by default', () => {
        const state = createLightingState();
        expect(state.config.sunIntensity).toBe(DEFAULT_LIGHT_CONFIG.sunIntensity);
        expect(state.config.ambientIntensity).toBe(DEFAULT_LIGHT_CONFIG.ambientIntensity);
        expect(state.config.isNight).toBe(false);
    });

    test('starts with no point lights', () => {
        const state = createLightingState();
        expect(state.pointLights).toHaveLength(0);
    });

    test('starts disabled', () => {
        const state = createLightingState();
        expect(state.enabled).toBe(false);
    });

    test('creates independent copies', () => {
        const a = createLightingState();
        const b = createLightingState();
        a.config = { ...NIGHT_LIGHT_CONFIG };
        expect(b.config.isNight).toBe(false);
    });
});

describe('toggleDayNight', () => {
    test('switches from day to night', () => {
        const state = createLightingState();
        toggleDayNight(state);
        expect(state.config.isNight).toBe(true);
        expect(state.config.sunIntensity).toBe(0);
    });

    test('switches from night back to day', () => {
        const state = createLightingState();
        toggleDayNight(state); // → night
        toggleDayNight(state); // → day
        expect(state.config.isNight).toBe(false);
        expect(state.config.sunIntensity).toBe(DEFAULT_LIGHT_CONFIG.sunIntensity);
    });

    test('preserves ambient on toggle', () => {
        const state = createLightingState();
        toggleDayNight(state);
        expect(state.config.ambientIntensity).toBe(NIGHT_LIGHT_CONFIG.ambientIntensity);
    });
});

describe('constants', () => {
    test('MAX_POINT_LIGHTS is 8', () => {
        expect(MAX_POINT_LIGHTS).toBe(8);
    });

    test('RESOLUTION_SCALE is 4', () => {
        expect(RESOLUTION_SCALE).toBe(4);
    });

    test('ATLAS_MARGIN_BLOCKS >= sunMaxDistance', () => {
        expect(ATLAS_MARGIN_BLOCKS).toBeGreaterThanOrEqual(DEFAULT_LIGHT_CONFIG.sunMaxDistance);
    });

    test('TORCH_LIGHT_DEFAULTS has warm color', () => {
        expect(TORCH_LIGHT_DEFAULTS.radius).toBe(48);
        expect(TORCH_LIGHT_DEFAULTS.color).toHaveLength(3);
        expect(TORCH_LIGHT_DEFAULTS.intensity).toBe(1);
    });

    test('night config has zero sun', () => {
        expect(NIGHT_LIGHT_CONFIG.sunIntensity).toBe(0);
        expect(NIGHT_LIGHT_CONFIG.isNight).toBe(true);
    });

    test('day config has positive sun', () => {
        expect(DEFAULT_LIGHT_CONFIG.sunIntensity).toBeGreaterThan(0);
        expect(DEFAULT_LIGHT_CONFIG.isNight).toBe(false);
    });
});
