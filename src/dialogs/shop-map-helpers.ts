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
    markers: ReadonlyArray<{ name: string; screenX: number; screenY: number }>
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
 * Create an edge marker element for a player who is off-screen.
 * The marker appears at the edge of the visible map area, pointing toward the player.
 * 
 * @param parameters - Edge marker configuration
 * @returns The created edge marker DOM element
 */
export function createEdgeMarker(parameters: EdgeMarkerParameters): HTMLElement {
    const { player, angle, centerX, centerY, edgeRadius, visibleRadiusMapUnits, playerCoords, mapCenter } = parameters;
    const dx = playerCoords.lng - mapCenter.lng;
    const dy = playerCoords.lat - mapCenter.lat;
    const distance = Math.hypot(dx, dy);
    const minSize = 4;
    const maxSize = 12;
    const logScale = Math.log10(distance / visibleRadiusMapUnits + 1);
    const size = Math.max(minSize, maxSize - logScale * 4);
    
    const edgeX = centerX + edgeRadius * Math.cos(angle);
    const edgeY = centerY - edgeRadius * Math.sin(angle);
    
    const edgeMarker = document.createElement('div');
    edgeMarker.className = 'player-edge-marker';
    edgeMarker.title = player.name;
    edgeMarker.style.left = `${edgeX}px`;
    edgeMarker.style.top = `${edgeY}px`;
    edgeMarker.style.width = `${size}px`;
    edgeMarker.style.height = `${size}px`;
    
    const nameLabel = document.createElement('span');
    nameLabel.className = 'player-name';
    nameLabel.textContent = player.name;
    
    const angleDeg = angle * 180 / Math.PI;
    if (angleDeg > 45 && angleDeg < 135) {
        nameLabel.classList.add('label-bottom');
    } else if (angleDeg < -45 && angleDeg > -135) {
        nameLabel.classList.add('label-top');
    } else if (edgeX > centerX) {
        nameLabel.classList.add('label-left');
    }
    
    edgeMarker.append(nameLabel);
    return edgeMarker;
}
