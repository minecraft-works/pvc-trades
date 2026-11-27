/**
 * Download the live shop data for local development (`public/data.json`).
 * The app reads that file only when running on localhost; production fetches
 * `config.dataUrl` directly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { AppConfigSchema, ShopDataSchema } from '../src/types';

const config = AppConfigSchema.safeParse(JSON.parse(readFileSync('config.json', 'utf8')));
if (!config.success) {
    throw new Error('Invalid config.json');
}

const response = await fetch(config.data.dataUrl);
if (!response.ok) {
    throw new Error(`${config.data.dataUrl} returned ${String(response.status)}`);
}

const data: unknown = await response.json();
const parsed = ShopDataSchema.safeParse(data);
if (!parsed.success) {
    throw new Error('Shop data does not match ShopDataSchema');
}

mkdirSync('public', { recursive: true });
writeFileSync('public/data.json', JSON.stringify(data));
console.log(`Saved ${String(parsed.data.data.length)} shops to public/data.json`);
