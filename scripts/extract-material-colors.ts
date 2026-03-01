/**
 * extract-material-colors.ts
 *
 * Downloads the Minecraft client JAR and extracts material color tables for use
 * in heightmap-shader.ts's classifyMaterial().
 *
 * Outputs: scripts/material-colors.gen.ts (committed, imported by heightmap-shader)
 *
 * Sources extracted from the JAR:
 *   assets/minecraft/textures/colormap/grass.png   (256×256 = all grass/foliage hues)
 *   assets/minecraft/textures/colormap/foliage.png (256×256 = tree leaf hues)
 *   data/minecraft/worldgen/biome/*.json            (water_color per biome)
 *
 * Usage:
 *   npx tsx scripts/extract-material-colors.ts [--mc-version 1.21.4]
 *
 * The JAR is cached in .mc-jar-cache/ and reused on subsequent runs.
 */

import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
// eslint-disable-next-line import/no-extraneous-dependencies
import StreamZip from 'node-stream-zip';

// ============================================================================
// Config
// ============================================================================

/** Cache directory for downloaded JARs (gitignored, relative to CWD / project root). */
const JAR_CACHE_DIR = '.mc-jar-cache';

/** Output path for the generated TypeScript color table (relative to CWD). */
const OUTPUT_PATH = 'scripts/material-colors.gen.ts';
const VERSION_MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

/** Max unique representative colors to emit per material (after quantization). */
const MAX_COLORS_PER_MATERIAL = 64;

/** Quantization step: colors within this Euclidean radius are merged. */
const QUANT_RADIUS = 16;

// ============================================================================
// CLI args
// ============================================================================

const versionArg = process.argv.find(a => a.startsWith('--mc-version='))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--mc-version') + 1];

// ============================================================================
// Helpers
// ============================================================================

/** Fetch a URL and return a Buffer. */
async function fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) { throw new Error(`HTTP ${res.status} fetching ${url}`); }
    return Buffer.from(await res.arrayBuffer());
}

/** Download a URL to a file path, streaming. */
async function downloadToFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) { throw new Error(`HTTP ${res.status} downloading ${url}`); }
    const ws = createWriteStream(dest);
    // @ts-expect-error – Node ReadableStream ↔ web ReadableStream compat
    await pipeline(res.body!, ws);
}

/** Extract a single entry from a ZIP/JAR to a Buffer. */
async function extractEntry(zip: StreamZip.StreamZipAsync, entryName: string): Promise<Buffer> {
    const data = await zip.entryData(entryName);
    return data as Buffer;
}

/**
 * Deduplicate an array of [R,G,B] triples by merging any two colors whose
 * Euclidean distance is less than QUANT_RADIUS, keeping the most frequent one.
 * Returns at most MAX_COLORS_PER_MATERIAL entries.
 */
function quantizeColors(colors: ReadonlyArray<readonly [number, number, number]>): Array<[number, number, number]> {
    // Count frequency
    const freq = new Map<string, { color: readonly [number, number, number]; count: number }>();
    for (const c of colors) {
        // Round to nearest 8 for quantization key
        const key = `${Math.round(c[0] / 8) * 8},${Math.round(c[1] / 8) * 8},${Math.round(c[2] / 8) * 8}`;
        const existing = freq.get(key);
        if (existing) {
            existing.count++;
        } else {
            freq.set(key, { color: c, count: 1 });
        }
    }

    // Sort by frequency descending
    const sorted = [...freq.values()].sort((a, b) => b.count - a.count);

    // Greedy deduplication: keep a color only if it's not within QUANT_RADIUS of an already-kept color
    const kept: Array<[number, number, number]> = [];
    for (const { color } of sorted) {
        const [r, g, b] = color;
        const tooClose = kept.some(([kr, kg, kb]) =>
            (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2 < QUANT_RADIUS ** 2,
        );
        if (!tooClose) {
            kept.push([r, g, b]);
            if (kept.length >= MAX_COLORS_PER_MATERIAL) { break; }
        }
    }

    return kept;
}

/** Read all pixels from a PNG buffer, returning array of [R,G,B] tuples (opaque pixels only). */
async function readPngColors(pngBuffer: Buffer): Promise<Array<readonly [number, number, number]>> {
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const colors: Array<readonly [number, number, number]> = [];
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) { continue; } // skip transparent
        colors.push([data[i], data[i + 1], data[i + 2]]);
    }
    return colors;
}

/** Convert a 0xRRGGBB integer to [R,G,B] tuple. */
function hexToRgb(hex: number): [number, number, number] {
    return [(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF];
}

// ============================================================================
// Biome JSON water color extraction
// ============================================================================

interface BiomeEffects {
    water_color?: number;
    water_fog_color?: number;
    grass_color?: number;
    foliage_color?: number;
}

interface BiomeJson {
    effects?: BiomeEffects;
}

async function extractBiomeWaterColors(zip: StreamZip.StreamZipAsync): Promise<Array<[number, number, number]>> {
    const entries = await zip.entries();
    const biomeFiles = Object.keys(entries).filter(e =>
        e.startsWith('data/minecraft/worldgen/biome/') && e.endsWith('.json'),
    );

    console.log(`  Found ${biomeFiles.length} biome JSON files`);

    const waterColors: Array<[number, number, number]> = [];
    for (const file of biomeFiles) {
        const raw = await extractEntry(zip, file);
        const biome = JSON.parse(raw.toString('utf-8')) as BiomeJson;
        const wc = biome.effects?.water_color;
        if (typeof wc === 'number') {
            waterColors.push(hexToRgb(wc));
        }
    }
    return waterColors;
}

// ============================================================================
// Colormap PNG processing
// ============================================================================

/**
 * BlueMap multiplies block textures by the colormap color.
 * For grass, the base texture is mostly mid-grey (~128). The rendered pixel
 * is approximately: rendered = base_grey/255 * colormap_color.
 * We simulate a base factor of 0.8 (typical grey grass texture avg).
 */
function applyGrassTextureFactor(colors: Array<readonly [number, number, number]>): Array<readonly [number, number, number]> {
    const FACTOR = 0.82;
    return colors.map(([r, g, b]) => [
        Math.round(r * FACTOR),
        Math.round(g * FACTOR),
        Math.round(b * FACTOR),
    ] as readonly [number, number, number]);
}

// ============================================================================
// Code generation
// ============================================================================

function generateTs(
    waterColors: Array<[number, number, number]>,
    grassColors: Array<[number, number, number]>,
    foliageColors: Array<[number, number, number]>,
    mcVersion: string,
): string {
    const fmt = (colors: Array<[number, number, number]>) =>
        colors.map(([r, g, b]) => `    [${r}, ${g}, ${b}],`).join('\n');

    return `/**
 * material-colors.gen.ts — GENERATED FILE, DO NOT EDIT BY HAND
 *
 * Auto-generated by scripts/extract-material-colors.ts from Minecraft ${mcVersion}.
 * Run \`npx tsx scripts/extract-material-colors.ts\` to regenerate.
 *
 * Sources:
 *   - Water: biome water_color fields from data/minecraft/worldgen/biome/*.json
 *   - Grass: assets/minecraft/textures/colormap/grass.png × 0.82 texture factor
 *   - Foliage: assets/minecraft/textures/colormap/foliage.png × 0.82 texture factor
 *
 * Each array contains representative [R, G, B] triples (quantized, max ${MAX_COLORS_PER_MATERIAL} per material).
 * Used by classifyMaterial() in heightmap-shader.ts via Euclidean histogram lookup.
 */

/** Minecraft version this data was extracted from. */
export const MC_VERSION = '${mcVersion}';

/**
 * Representative water surface colors across all Minecraft biomes.
 * Covers cold ocean (#3938C9), lukewarm (#45ADF2), warm (#43D5EE), swamp (#617B64), etc.
 */
export const WATER_REF_COLORS: ReadonlyArray<readonly [number, number, number]> = [
${fmt(waterColors)}
] as const;

/**
 * Representative grass block top colors as rendered by BlueMap.
 * Sampled from the 256×256 grass colormap with 0.82 texture factor applied.
 * Covers plains, jungle, desert, snowy, badlands, etc.
 */
export const GRASS_REF_COLORS: ReadonlyArray<readonly [number, number, number]> = [
${fmt(grassColors)}
] as const;

/**
 * Representative tree foliage (leaf) colors as rendered by BlueMap.
 * Sampled from the 256×256 foliage colormap with 0.82 texture factor applied.
 * Generally darker and more saturated than grass.
 */
export const FOLIAGE_REF_COLORS: ReadonlyArray<readonly [number, number, number]> = [
${fmt(foliageColors)}
] as const;
`;
}

// ============================================================================
// Main
// ============================================================================

async function resolveJarUrl(requestedVersion: string | undefined): Promise<{ url: string; version: string }> {
    console.log('Fetching Minecraft version manifest...');
    const manifest = await fetchBuffer(VERSION_MANIFEST_URL);
    const json = JSON.parse(manifest.toString('utf-8')) as {
        latest: { release: string };
        versions: Array<{ id: string; type: string; url: string }>;
    };

    const version = requestedVersion ?? json.latest.release;
    const entry = json.versions.find(v => v.id === version);
    if (!entry) {
        throw new Error(`Version ${version} not found. Latest release: ${json.latest.release}`);
    }

    console.log(`Fetching package metadata for ${version}...`);
    const pkgBuf = await fetchBuffer(entry.url);
    const pkg = JSON.parse(pkgBuf.toString('utf-8')) as {
        downloads: { client: { url: string; sha1: string } };
    };

    return { url: pkg.downloads.client.url, version };
}

async function main(): Promise<void> {
    mkdirSync(JAR_CACHE_DIR, { recursive: true });

    // If a version is explicitly provided and the JAR is already cached, skip
    // the Mojang version manifest fetch entirely (useful behind firewalls).
    // Manually place the JAR at .mc-jar-cache/client-<version>.jar to use this.
    let jarPath: string;
    let mcVersion: string;

    if (versionArg) {
        mcVersion = versionArg;
        jarPath = path.join(JAR_CACHE_DIR, `client-${mcVersion}.jar`);
        if (existsSync(jarPath)) {
            console.log(`Using cached JAR: ${jarPath}`);
        } else {
            console.log(`JAR not cached — fetching from Mojang for ${mcVersion}...`);
            const { url: jarUrl } = await resolveJarUrl(versionArg);
            console.log(`  URL: ${jarUrl}`);
            await downloadToFile(jarUrl, jarPath);
            console.log('  Download complete.');
        }
    } else {
        const resolved = await resolveJarUrl(undefined);
        mcVersion = resolved.version;
        jarPath = path.join(JAR_CACHE_DIR, `client-${mcVersion}.jar`);
        if (existsSync(jarPath)) {
            console.log(`Using cached JAR: ${jarPath}`);
        } else {
            console.log(`Downloading client JAR for ${mcVersion}...`);
            console.log(`  URL: ${resolved.url}`);
            await downloadToFile(resolved.url, jarPath);
            console.log('  Download complete.');
        }
    }

    console.log('Opening JAR...');
    const zip = new StreamZip.async({ file: jarPath });

    try {
        // ----- Water colors from biome JSONs -----
        console.log('\nExtracting water colors from biome JSONs...');
        const rawWaterColors = await extractBiomeWaterColors(zip);
        const waterColors = quantizeColors(rawWaterColors);
        console.log(`  ${rawWaterColors.length} raw → ${waterColors.length} representative colors`);

        // ----- Grass colormap -----
        console.log('\nExtracting grass colormap...');
        const grassPng = await extractEntry(zip, 'assets/minecraft/textures/colormap/grass.png');
        const rawGrassColors = await readPngColors(grassPng);
        const grassColorsRaw = quantizeColors(rawGrassColors);
        const grassColors = quantizeColors(applyGrassTextureFactor(grassColorsRaw)) as Array<[number, number, number]>;
        console.log(`  ${rawGrassColors.length} raw pixels → ${grassColors.length} representative colors`);

        // ----- Foliage colormap -----
        console.log('\nExtracting foliage colormap...');
        const foliagePng = await extractEntry(zip, 'assets/minecraft/textures/colormap/foliage.png');
        const rawFoliageColors = await readPngColors(foliagePng);
        const foliageColorsRaw = quantizeColors(rawFoliageColors);
        const foliageColors = quantizeColors(applyGrassTextureFactor(foliageColorsRaw)) as Array<[number, number, number]>;
        console.log(`  ${rawFoliageColors.length} raw pixels → ${foliageColors.length} representative colors`);

        // ----- Generate output -----
        const output = generateTs(waterColors, grassColors, foliageColors, mcVersion);
        writeFileSync(OUTPUT_PATH, output, 'utf-8');
        console.log(`\nWrote: ${OUTPUT_PATH}`);
        console.log(`  Water: ${waterColors.length} colors`);
        console.log(`  Grass: ${grassColors.length} colors`);
        console.log(`  Foliage: ${foliageColors.length} colors`);
        console.log('\nDone. Commit scripts/material-colors.gen.ts to update the classifier.');
    } finally {
        await zip.close();
    }
}

main().catch((err: unknown) => {
    console.error('Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
});
