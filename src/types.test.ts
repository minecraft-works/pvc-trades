/**
 * Unit tests for src/types.ts
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { AppConfigSchema } from './types.js';

// String constants to avoid duplication
const CONFIG_JSON = 'config.json';

describe('config.json file validation', () => {
    test('dataUrl points to remote API, not a local file', async () => {
        const raw = await readFile(path.resolve(__dirname, '..', CONFIG_JSON), 'utf8');
        const json: unknown = JSON.parse(raw);
        const result = AppConfigSchema.safeParse(json);
        expect(result.success).toBe(true);
        if (!result.success) { return; }
        expect(result.data.dataUrl).toMatch(/^https?:\/\//);
        expect(result.data.dataUrl).not.toMatch(/^\.[\\/]/);
    });
});
