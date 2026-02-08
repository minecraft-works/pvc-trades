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
