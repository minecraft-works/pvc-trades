/**
 * Worker thread for parallel emitter spread computation.
 *
 * Receives a chunk of emitters and a shared heightmap, accumulates light
 * contributions, and posts back the result buffer.
 */
import { parentPort, workerData } from 'node:worker_threads';

interface Emitter {
    x: number;
    z: number;
    strength: number;
    height: number;
}

interface WorkerInput {
    heightsBuf: SharedArrayBuffer;
    width: number;
    height: number;
    emitters: Emitter[];
    maxRadius: number;
    falloff: number;
}

/**
 * Type guard to validate worker input structure at runtime.
 *
 * @param data - Raw worker data from parent thread
 * @returns Whether the data matches WorkerInput shape
 */
function isWorkerInput(data: unknown): data is WorkerInput {
    if (typeof data !== 'object' || data === null) { return false; }
    return (
        'heightsBuf' in data && data.heightsBuf instanceof SharedArrayBuffer
        && 'width' in data && typeof data.width === 'number'
        && 'height' in data && typeof data.height === 'number'
        && 'emitters' in data && Array.isArray(data.emitters)
        && 'maxRadius' in data && typeof data.maxRadius === 'number'
        && 'falloff' in data && typeof data.falloff === 'number'
    );
}

// --------------------------------------------------------------------------
// Inlined LOS + spread (avoids cross-module import issues with tsx workers)
// --------------------------------------------------------------------------

/**
 * Check line-of-sight between emitter and target via stride-2 ray march.
 *
 * @param heights - Decoded heightmap
 * @param width - Image width
 * @param ex - Emitter X
 * @param ez - Emitter Z
 * @param emitterH - Emitter height
 * @param tx - Target X
 * @param tz - Target Z
 * @param targetH - Target terrain height
 * @returns True if line-of-sight is clear
 */
function hasLineOfSight(
    heights: Float32Array,
    width: number,
    ex: number, ez: number, emitterH: number,
    tx: number, tz: number, targetH: number,
): boolean {
    const dx = tx - ex;
    const dz = tz - ez;
    const steps = Math.max(Math.abs(dx), Math.abs(dz));
    if (steps <= 1) { return true; }

    const stepX = dx / steps;
    const stepZ = dz / steps;

    for (let s = 2; s < steps; s += 2) {
        const sx = Math.round(ex + stepX * s);
        const sz = Math.round(ez + stepZ * s);
        const t = s / steps;
        const rayH = emitterH * (1 - t) + targetH * t;
        const terrainH = heights[sz * width + sx];
        if (terrainH > rayH) { return false; }
    }
    return true;
}

/**
 * Test and accumulate light for a single target pixel from an emitter.
 *
 * @param em - Emitter metadata
 * @param accumulated - Light accumulation buffer (mutated)
 * @param heights - Decoded heightmap
 * @param width - Image width
 * @param px - Target pixel X
 * @param pz - Target pixel Z
 * @param dz - Vertical offset from emitter
 * @param falloff - Inverse-square falloff coefficient
 */
function accumulatePixel(
    em: Emitter,
    accumulated: Float32Array,
    heights: Float32Array,
    width: number,
    px: number,
    pz: number,
    dz: number,
    falloff: number,
): void {
    const dx = px - em.x;
    const d2 = dx * dx + dz * dz;
    const targetH = heights[pz * width + px];
    if (targetH > em.height) { return; }
    if (d2 >= 16 && !hasLineOfSight(heights, width, em.x, em.z, em.height, px, pz, targetH)) {
        return;
    }
    accumulated[pz * width + px] += em.strength / (1 + falloff * d2);
}

/**
 * Spread light from all emitters with terrain occlusion.
 *
 * @param emitters - Array of emitter clusters
 * @param accumulated - Light accumulation buffer (mutated)
 * @param heights - Decoded heightmap
 * @param width - Image width
 * @param height - Image height
 * @param maxRadius - Maximum spread radius
 * @param falloff - Inverse-square falloff coefficient
 */
function spreadEmitters(
    emitters: Emitter[],
    accumulated: Float32Array,
    heights: Float32Array,
    width: number,
    height: number,
    maxRadius: number,
    falloff: number,
): void {
    const r2max = maxRadius * maxRadius;
    for (const em of emitters) {
        for (let dz = -maxRadius; dz <= maxRadius; dz++) {
            const pz = em.z + dz;
            if (pz < 0 || pz >= height) { continue; }
            const maxDx = Math.floor(Math.sqrt(r2max - dz * dz));
            const xStart = Math.max(0, em.x - maxDx);
            const xEnd   = Math.min(width - 1, em.x + maxDx);
            for (let px = xStart; px <= xEnd; px++) {
                accumulatePixel(em, accumulated, heights, width, px, pz, dz, falloff);
            }
        }
    }
}

// --------------------------------------------------------------------------
// Main worker entry
// --------------------------------------------------------------------------

if (!isWorkerInput(workerData)) {
    throw new Error('Invalid worker data');
}

const { heightsBuf, width, height, emitters, maxRadius, falloff } = workerData;
const heights = new Float32Array(heightsBuf);
const n = width * height;
const accumulated = new Float32Array(n);

spreadEmitters(emitters, accumulated, heights, width, height, maxRadius, falloff);

// Transfer the buffer back (zero-copy)
if (parentPort) {
    parentPort.postMessage(accumulated.buffer, [accumulated.buffer]);
}
