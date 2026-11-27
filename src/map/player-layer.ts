/**
 * Players on the shop map.
 *
 * Every player has one map marker and one rim marker (for when they are off
 * the round map) that live as long as the player is online. `update()` runs
 * every animation frame and only moves them, so nothing is rebuilt while
 * the map pans or players walk, which keeps the map smooth.
 *
 * @module map/player-layer
 */

import type * as L from 'leaflet';
import { html } from 'lit-html';

import { createEdgeMarker, pickNamedRimMarkers, resolvePlayerLabelPositions, spreadAngles, updateEdgeMarker } from '../dialogs/index.js';
import type { EdgeMarkerParameters } from '../dialogs/shop-map-helpers.js';
import { renderToElement } from '../rendering/render.js';
import type { Player } from '../types.js';
import { leaflet } from './leaflet.js';

/** Height of a player name label */
const EDGE_LABEL_HEIGHT_PX = 15;
/** How far a rim name reaches into the map (CSS max-width 80px plus its 9px offset) */
const EDGE_LABEL_REACH_PX = 89;
/** Smallest gap between unnamed rim dots */
const EDGE_DOT_GAP_PX = 10;
/** Distance of the rim markers outside the round map */
const EDGE_OFFSET_PX = 8;

/** Options for {@link createPlayerLayer} */
export interface PlayerLayerOptions {
    readonly map: L.Map;
    /** Element that holds the rim markers (the map dialog) */
    readonly rim: HTMLElement;
    /** Where a player is now, in map coordinates (interpolated) */
    readonly getCoords: (player: Player) => L.LatLngLiteral;
    /** Stacking of player markers relative to other markers */
    readonly zIndexOffset: number;
}

/** Public API */
export interface PlayerLayer {
    /** Players in this world; adds and removes markers as players come and go */
    setPlayers: (players: readonly Player[]) => void;
    /** Move every marker to its player's current position (call each frame) */
    update: () => void;
    /** Highlight one player, or none */
    setSelected: (name: string | undefined) => void;
    /** Remove all markers */
    remove: () => void;
}

interface Entry {
    player: Player;
    readonly marker: L.Marker;
    readonly edge: HTMLElement;
    /** Label side class last applied, to avoid needless DOM writes */
    labelClass: string;
}

/** A player off the round map, shown on its rim */
interface RimPlayer {
    readonly entry: Entry;
    readonly coords: L.LatLngLiteral;
    readonly angle: number;
}

/**
 * Show or hide an element without needless DOM writes
 * @param element - Element
 * @param visible - Whether it should be shown
 */
function setVisible(element: HTMLElement | undefined, visible: boolean): void {
    if (!element) { return; }
    const display = visible ? '' : 'none';
    if (element.style.display !== display) { element.style.display = display; }
}

/**
 * Spread a subset of rim angles apart, leaving the others as they are
 * @param target - Angles to write the spread ones into
 * @param angles - Original angles
 * @param include - Which angles belong to the subset
 * @param minSeparation - Smallest gap in radians
 */
function spreadWhere(target: number[], angles: readonly number[], include: readonly boolean[], minSeparation: number): void {
    const indexes = angles.flatMap((_angle, index) => (include[index] ? [index] : []));
    const spread = spreadAngles(indexes.map(index => angles[index] ?? 0), minSeparation);
    for (const [position, index] of indexes.entries()) {
        target[index] = spread[position] ?? target[index] ?? 0;
    }
}

/**
 * Create the player layer of a shop map.
 * @param options - Map, rim container and position lookup
 * @returns Player layer
 */
export function createPlayerLayer(options: PlayerLayerOptions): PlayerLayer {
    const { map, rim, getCoords, zIndexOffset } = options;
    const layer = leaflet().layerGroup().addTo(map);
    const entries = new Map<string, Entry>();
    let selected: string | undefined;

    function createEntry(player: Player): Entry {
        const marker = leaflet().marker([0, 0], {
            icon: leaflet().divIcon({
                className: 'leaflet-player-marker',
                html: renderToElement(html`<span class="player-dot"></span><span class="player-name">${player.name}</span>`),
                iconSize: [12, 12],
                iconAnchor: [6, 6],
            }),
            title: `Go to ${player.name}`,
            zIndexOffset,
        }).addTo(layer);
        const markerElement = marker.getElement();
        if (markerElement) {
            markerElement.dataset.player = player.name;
            setVisible(markerElement, false);
        }

        const edge = createEdgeMarker({
            player, angle: 0, centerX: 0, centerY: 0, edgeRadius: 0, visibleRadiusMapUnits: 1,
            playerCoords: { lat: 0, lng: 0 }, mapCenter: { lat: 0, lng: 0 },
        });
        edge.title = `Go to ${player.name}`;
        edge.dataset.player = player.name;
        setVisible(edge, false);
        rim.append(edge);
        return { player, marker, edge, labelClass: '' };
    }

    function applySelection(entry: Entry): void {
        const isSelected = entry.player.name === selected;
        entry.marker.getElement()?.classList.toggle('is-selected', isSelected);
        entry.edge.classList.toggle('is-selected', isSelected);
    }

    function setPlayers(players: readonly Player[]): void {
        const names = new Set(players.map(player => player.name));
        for (const [name, entry] of entries) {
            if (names.has(name)) { continue; }
            entry.marker.remove();
            entry.edge.remove();
            entries.delete(name);
        }
        for (const player of players) {
            const entry = entries.get(player.name);
            if (entry) {
                entry.player = player;
            } else {
                const created = createEntry(player);
                applySelection(created);
                entries.set(player.name, created);
            }
        }
    }

    function update(): void {
        const size = map.getSize();
        const center = map.getCenter();
        // CRS.Simple: one map unit is 2^zoom pixels
        const visibleRadiusMapUnits = Math.min(size.x, size.y) / 2 / 2 ** map.getZoom();
        const geometry = { visibleRadiusMapUnits, centerX: size.x / 2, centerY: size.y / 2, edgeRadius: size.x / 2 + EDGE_OFFSET_PX, mapCenter: center };

        const onMap: { entry: Entry; coords: L.LatLngLiteral }[] = [];
        const onRim: RimPlayer[] = [];
        for (const entry of entries.values()) {
            const coords = getCoords(entry.player);
            const dLat = coords.lat - center.lat;
            const dLng = coords.lng - center.lng;
            if (Math.hypot(dLat, dLng) <= visibleRadiusMapUnits) {
                onMap.push({ entry, coords });
            } else {
                onRim.push({ entry, coords, angle: Math.atan2(dLat, dLng) });
            }
        }

        const layouts = resolvePlayerLabelPositions(onMap.map(({ entry, coords }) => {
            const point = map.latLngToContainerPoint(coords);
            return { name: entry.player.name, screenX: point.x, screenY: point.y };
        }));
        for (const [index, { entry, coords }] of onMap.entries()) {
            entry.marker.setLatLng(coords);
            setVisible(entry.marker.getElement(), true);
            setVisible(entry.edge, false);
            const labelClass = layouts[index]?.cssClass ?? '';
            if (labelClass !== entry.labelClass) {
                entry.labelClass = labelClass;
                const label = entry.marker.getElement()?.querySelector('.player-name');
                if (label) { label.className = labelClass ? `player-name ${labelClass}` : 'player-name'; }
            }
        }

        updateRim(onRim, geometry);
    }

    function updateRim(onRim: readonly RimPlayer[], geometry: Omit<EdgeMarkerParameters, 'player' | 'angle' | 'playerCoords'>): void {
        const { mapCenter, edgeRadius } = geometry;
        const named = pickNamedRimMarkers(
            onRim.map(({ coords }) => Math.hypot(coords.lat - mapCenter.lat, coords.lng - mapCenter.lng)),
            edgeRadius - EDGE_OFFSET_PX,
        ).map((isNamed, index) => isNamed || onRim[index]?.entry.player.name === selected);
        // Names point inward, so neighbours converge: named markers are spread so their
        // names are a label height apart at their inner end; unnamed dots by a dot
        const innerRadius = Math.max(edgeRadius - EDGE_LABEL_REACH_PX, edgeRadius / 2);
        const angles = onRim.map(edge => edge.angle);
        const spread = [...angles];
        spreadWhere(spread, angles, named, EDGE_LABEL_HEIGHT_PX / innerRadius);
        spreadWhere(spread, angles, named.map(isNamed => !isNamed), EDGE_DOT_GAP_PX / edgeRadius);
        for (const [index, { entry, coords, angle }] of onRim.entries()) {
            setVisible(entry.marker.getElement(), false);
            updateEdgeMarker(entry.edge, { ...geometry, player: entry.player, angle: spread[index] ?? angle, playerCoords: coords });
            const unnamed = !named[index];
            if (entry.edge.classList.contains('is-unnamed') !== unnamed) { entry.edge.classList.toggle('is-unnamed', unnamed); }
            setVisible(entry.edge, true);
        }
    }

    return {
        setPlayers,
        update,
        setSelected(name) {
            selected = name;
            for (const entry of entries.values()) { applySelection(entry); }
        },
        remove() {
            for (const entry of entries.values()) { entry.edge.remove(); }
            entries.clear();
            layer.remove();
        },
    };
}
