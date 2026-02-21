/**
 * PNG creation utilities for test mocks.
 * Generates minimal 1x1 colored PNGs for tile mocking.
 * @module tests/helpers/png-utils
 */

import { deflateSync } from 'node:zlib';

// CRC32 lookup table
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xED_B8_83_20 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

/**
 * Calculate CRC32 checksum for PNG chunk validation.
 *
 * @param data - Buffer to compute CRC for
 * @returns 4-byte Buffer containing the CRC32 value
 */
function crc32(data: Buffer): Buffer {
    let crc = 0xFF_FF_FF_FF;
    for (const datum of data) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- CRC table is fully populated (256 entries)
        crc = crcTable[(crc ^ datum) & 0xFF]! ^ (crc >>> 8);
    }
    crc = crc ^ 0xFF_FF_FF_FF;
    const result = Buffer.alloc(4);
    result.writeUInt32BE(crc >>> 0, 0);
    return result;
}

/**
 * Create a minimal 1x1 PNG image with a specific RGB color.
 * Used to generate colored tile mocks for overworld (blue) and nether (red).
 *
 * @param r - Red channel (0-255)
 * @param g - Green channel (0-255)
 * @param b - Blue channel (0-255)
 * @returns Buffer containing a valid PNG file
 */
export function createColoredPng(r: number, g: number, b: number): Buffer {
    const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk: width=1, height=1, bit depth=8, color type=2 (RGB)
    const ihdrData = Buffer.from([
        0x00, 0x00, 0x00, 0x01, // width
        0x00, 0x00, 0x00, 0x01, // height
        0x08, // bit depth
        0x02, // color type (RGB)
        0x00, // compression
        0x00, // filter
        0x00  // interlace
    ]);
    const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
    const ihdr = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x0D]), // length
        Buffer.from('IHDR'),
        ihdrData,
        ihdrCrc
    ]);
    
    // IDAT chunk: compressed image data
    const rawData = Buffer.from([0x00, r, g, b]); // filter byte + RGB
    const compressed = deflateSync(rawData);
    const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
    const idat = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from('IDAT'),
        compressed,
        idatCrc
    ]);
    idat.writeUInt32BE(compressed.length, 0);
    
    // IEND chunk
    const iendCrc = crc32(Buffer.from('IEND'));
    const iend = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // length
        Buffer.from('IEND'),
        iendCrc
    ]);
    
    return Buffer.concat([header, ihdr, idat, iend]);
}

/** Blue (RGB: 0, 100, 255) for overworld tiles */
export const BLUE_PIXEL_PNG = createColoredPng(0, 100, 255);

/** Red (RGB: 255, 50, 50) for nether tiles */
export const RED_PIXEL_PNG = createColoredPng(255, 50, 50);
