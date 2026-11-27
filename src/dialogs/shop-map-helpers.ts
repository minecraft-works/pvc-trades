/**
 * Shop Map Dialog Helpers
 * 
 * Pure helper functions for the shop map dialog.
 * These are extracted from main.ts to reduce complexity.
 * 
 * @module dialogs/shop-map-helpers
 */

// ============================================================================
// Types
// ============================================================================

/** Parameters for creating edge markers for off-screen players */
export interface EdgeMarkerParameters {
    player: {
        name: string;
    };
    angle: number;
    centerX: number;
    centerY: number;
    edgeRadius: number;
    visibleRadiusMapUnits: number;
    playerCoords: { lat: number; lng: number };
    mapCenter: { lat: number; lng: number };
}

/** Axis-aligned bounding rectangle for label collision detection */
export interface LabelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Possible label placement positions */
export type LabelPosition = 'right' | 'left' | 'top' | 'bottom';

/** Label layout result for a single player marker */
export interface LabelLayout {
    /** Player name (used as stable key) */
    name: string;
    /** Chosen CSS class ('' for right/default, 'label-left', 'label-top', 'label-bottom') */
    cssClass: string;
    /** The bounding rect occupied by this label placement */
    rect: LabelRect;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a human-readable display name for a world.
 * 
 * @param world - The raw world identifier
 * @returns Display name for the world
 */
export function getWorldDisplayName(world: string): string {
    if (world.includes('nether')) {
        return 'Nether';
    }
    if (world.includes('end')) {
        return 'The End';
    }
    return 'Overworld';
}

// ============================================================================
// Label Collision Avoidance
// ============================================================================

/** Approximate label dimensions (matches CSS: font-size 0.65rem, padding 1px 4px) */
const LABEL_CHAR_WIDTH = 6;
const LABEL_HEIGHT = 14;
const LABEL_PAD_X = 8;    // padding + gap from dot
const LABEL_OFFSET = 16;  // offset from marker centre (matches CSS `left: 16px`)
const MARKER_RADIUS = 6;  // half of 12px marker dot

/**
 * Estimate the pixel width of a player name label.
 * Uses a fixed character width since the font is monospace.
 *
 * @param name - Player name text
 * @returns Estimated label width in pixels (capped at CSS max-width 80px)
 */
export function estimateLabelWidth(name: string): number {
    return Math.min(name.length * LABEL_CHAR_WIDTH + LABEL_PAD_X, 80);
}

/**
 * Compute the bounding rectangle for a label at a given position relative to its marker.
 *
 * @param markerX - Screen X of the marker centre
 * @param markerY - Screen Y of the marker centre
 * @param labelWidth - Estimated label width in pixels
 * @param position - Which side of the marker the label sits on
 * @returns The label bounding rectangle in screen coordinates
 */
export function getLabelRect(markerX: number, markerY: number, labelWidth: number, position: LabelPosition): LabelRect {
    const halfH = LABEL_HEIGHT / 2;
    switch (position) {
        case 'right': {
            return { x: markerX + LABEL_OFFSET, y: markerY - halfH, width: labelWidth, height: LABEL_HEIGHT };
        }
        case 'left': {
            return { x: markerX - LABEL_OFFSET - labelWidth, y: markerY - halfH, width: labelWidth, height: LABEL_HEIGHT };
        }
        case 'top': {
            return { x: markerX - labelWidth / 2, y: markerY - MARKER_RADIUS - 4 - LABEL_HEIGHT, width: labelWidth, height: LABEL_HEIGHT };
        }
        case 'bottom': {
            return { x: markerX - labelWidth / 2, y: markerY + MARKER_RADIUS + 4, width: labelWidth, height: LABEL_HEIGHT };
        }
    }
}

/**
 * Check whether two rectangles overlap.
 *
 * @param a - First rectangle
 * @param b - Second rectangle
 * @returns True if the rectangles intersect
 */
export function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The four candidate positions tried in priority order */
const CANDIDATE_POSITIONS: LabelPosition[] = ['right', 'left', 'top', 'bottom'];

/**
 * Map a LabelPosition to the CSS class applied to `.player-name`.
 *
 * @param position - The chosen label position
 * @returns CSS class string (empty string for the default 'right' position)
 */
export function positionToCssClass(position: LabelPosition): string {
    switch (position) {
        case 'right': { return ''; }
        case 'left':  { return 'label-left'; }
        case 'top':   { return 'label-top'; }
        case 'bottom': { return 'label-bottom'; }
    }
}

/**
 * Resolve label positions for a set of player markers using greedy collision avoidance.
 *
 * Players are processed in the order given (caller should sort by priority — e.g.
 * navigating player first, then alphabetical). Each label tries positions in order
 * right → left → top → bottom, picking the first that doesn't overlap any
 * already-placed label. If all overlap, falls back to 'right' (the default).
 *
 * @param markers - Array of { name, screenX, screenY } for each player marker
 * @returns Array of LabelLayout with chosen CSS class and occupied rectangle
 */
export function resolvePlayerLabelPositions(
    markers: readonly { name: string; screenX: number; screenY: number }[]
): LabelLayout[] {
    const placed: LabelLayout[] = [];

    for (const marker of markers) {
        const labelWidth = estimateLabelWidth(marker.name);
        let chosenPosition: LabelPosition = 'right';
        let chosenRect = getLabelRect(marker.screenX, marker.screenY, labelWidth, 'right');

        for (const candidate of CANDIDATE_POSITIONS) {
            const candidateRect = getLabelRect(marker.screenX, marker.screenY, labelWidth, candidate);
            const overlaps = placed.some(p => rectsOverlap(candidateRect, p.rect));
            if (!overlaps) {
                chosenPosition = candidate;
                chosenRect = candidateRect;
                break;
            }
        }

        placed.push({
            name: marker.name,
            cssClass: positionToCssClass(chosenPosition),
            rect: chosenRect,
        });
    }

    return placed;
}

/**
 * Rotation for an edge marker's name so it points from the rim toward the map
 * centre. Labels that would read upside down are turned half around and end
 * at the marker instead of starting there.
 *
 * @param angle - Marker angle in radians (0 = right, π/2 = top, as atan2 of map coords)
 * @returns CSS rotation in degrees and whether the label ends at the marker
 *
 * @example
 * getRadialLabelRotation(Math.PI)  // left edge: { degrees: 0, flipped: false } (text runs right)
 * getRadialLabelRotation(0)        // right edge: { degrees: 0, flipped: true } (text ends at the dot)
 */
export function getRadialLabelRotation(angle: number): { readonly degrees: number; readonly flipped: boolean } {
    // Inward direction on screen (y grows downward): 180° − angle. Exactly
    // vertical names (top and bottom edge) both read top to bottom.
    const inward = (((180 - angle * 180 / Math.PI) % 360) + 360) % 360;
    const flipped = inward > 90 && inward <= 270;
    return { degrees: Math.round(flipped ? inward - 180 : inward), flipped };
}

interface AngleEntry {
    readonly index: number;
    readonly angle: number;
}

/**
 * Order angles starting just after the widest gap, unwrapped to increase
 * monotonically, so the circle can be treated as a line.
 * @param angles - Angles in radians
 * @returns Entries with their input index, ascending
 */
function cutAtWidestGap(angles: readonly number[]): AngleEntry[] {
    const fullTurn = 2 * Math.PI;
    const sorted = angles
        .map((angle, index) => ({ index, angle: ((angle % fullTurn) + fullTurn) % fullTurn }))
        .toSorted((a, b) => a.angle - b.angle);
    let widest = -1;
    let start = 0;
    for (const [position, entry] of sorted.entries()) {
        const next = sorted[(position + 1) % sorted.length] ?? entry;
        const gap = (next.angle - entry.angle + fullTurn) % fullTurn;
        if (gap > widest) { widest = gap; start = (position + 1) % sorted.length; }
    }
    const ordered = [...sorted.slice(start), ...sorted.slice(0, start)];
    const first = ordered[0]?.angle ?? 0;
    return ordered.map(entry => ({ index: entry.index, angle: entry.angle < first ? entry.angle + fullTurn : entry.angle }));
}

/**
 * Merge neighbours into evenly spaced groups until no two groups overlap
 * @param line - Ascending angles
 * @param minSeparation - Spacing inside a group
 * @returns Groups with their centre and size, in order
 */
function groupCrowdedAngles(line: readonly AngleEntry[], minSeparation: number): { center: number; count: number }[] {
    const groups: { center: number; count: number }[] = [];
    const halfSpan = (group: { count: number }): number => ((group.count - 1) / 2) * minSeparation;
    const overlaps = (previous: { center: number; count: number } | undefined, last: { center: number; count: number } | undefined): boolean =>
        previous !== undefined && last !== undefined
        && (last.center - halfSpan(last)) - (previous.center + halfSpan(previous)) < minSeparation;

    for (const entry of line) {
        groups.push({ center: entry.angle, count: 1 });
        while (overlaps(groups.at(-2), groups.at(-1))) {
            const [previous, last] = groups.splice(-2, 2);
            if (!previous || !last) { break; }
            const count = previous.count + last.count;
            groups.push({ center: (previous.center * previous.count + last.center * last.count) / count, count });
        }
    }
    return groups;
}

/**
 * Nudge marker angles apart so neighbours are at least `minSeparation`
 * radians apart, keeping each crowded group centred where it was. The circle
 * is cut at its widest gap, so groups never wrap into each other.
 *
 * @param angles - Marker angles in radians
 * @param minSeparation - Smallest allowed gap in radians (label height ÷ radius)
 * @returns Adjusted angles in the same order as the input
 *
 * @example
 * spreadAngles([0, 0, 0], 0.1) // [-0.1, 0, 0.1] (in some order)
 */
export function spreadAngles(angles: readonly number[], minSeparation: number): number[] {
    if (angles.length < 2) { return [...angles]; }
    const line = cutAtWidestGap(angles);
    const result = [...angles];
    let position = 0;
    for (const group of groupCrowdedAngles(line, minSeparation)) {
        for (let member = 0; member < group.count; member++) {
            const entry = line[position++];
            if (entry) { result[entry.index] = group.center + (member - (group.count - 1) / 2) * minSeparation; }
        }
    }
    return result;
}

/**
 * Move an edge marker to its place on the rim and point its name inward.
 * Positions are set with a transform, which the browser can update every
 * frame without re-laying out the page.
 *
 * @param edgeMarker - Element from {@link createEdgeMarker}
 * @param parameters - Edge marker configuration
 */
export function updateEdgeMarker(edgeMarker: HTMLElement, parameters: EdgeMarkerParameters): void {
    const { angle, centerX, centerY, edgeRadius, visibleRadiusMapUnits, playerCoords, mapCenter } = parameters;
    const distance = Math.hypot(playerCoords.lng - mapCenter.lng, playerCoords.lat - mapCenter.lat);
    const minSize = 4;
    const maxSize = 12;
    const logScale = Math.log10(distance / visibleRadiusMapUnits + 1);
    const size = Math.round(Math.max(minSize, maxSize - logScale * 4));

    const edgeX = (centerX + edgeRadius * Math.cos(angle)).toFixed(1);
    const edgeY = (centerY - edgeRadius * Math.sin(angle)).toFixed(1);
    edgeMarker.style.transform = `translate3d(${edgeX}px, ${edgeY}px, 0) translate(-50%, -50%)`;
    edgeMarker.style.width = `${size}px`;
    edgeMarker.style.height = `${size}px`;

    const nameLabel = edgeMarker.querySelector<HTMLElement>('.player-name');
    if (!nameLabel) { return; }
    const { degrees, flipped } = getRadialLabelRotation(angle);
    nameLabel.style.setProperty('--label-angle', `${degrees}deg`);
    nameLabel.classList.toggle('label-radial-end', flipped);
}

/**
 * Create an edge marker element for a player who is off-screen.
 * The marker appears at the edge of the visible map area, pointing toward the
 * player, with the name running inward toward the map centre.
 * 
 * @param parameters - Edge marker configuration
 * @returns The created edge marker DOM element
 */
export function createEdgeMarker(parameters: EdgeMarkerParameters): HTMLElement {
    const edgeMarker = document.createElement('div');
    edgeMarker.className = 'player-edge-marker';
    edgeMarker.title = parameters.player.name;

    const nameLabel = document.createElement('span');
    nameLabel.className = 'player-name label-radial';
    nameLabel.textContent = parameters.player.name;
    edgeMarker.append(nameLabel);

    updateEdgeMarker(edgeMarker, parameters);
    return edgeMarker;
}
