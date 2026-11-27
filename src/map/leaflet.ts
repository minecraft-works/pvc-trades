/**
 * Leaflet, loaded on demand.
 *
 * Leaflet is a third of the app's JavaScript but only needed once a map
 * opens, so it is a separate chunk. Await {@link loadLeaflet} before creating
 * a map; code that runs while a map exists uses {@link leaflet}.
 *
 * @module map/leaflet
 */

import type * as Leaflet from 'leaflet';

type LeafletModule = typeof Leaflet;

let loaded: LeafletModule | undefined;
let loading: Promise<LeafletModule> | undefined;

/**
 * Load Leaflet (once).
 * @returns The Leaflet module
 */
export function loadLeaflet(): Promise<LeafletModule> {
    loading ??= import('leaflet').then((module) => {
        loaded = module;
        return module;
    });
    return loading;
}

/**
 * Leaflet, for code that only runs after {@link loadLeaflet} resolved.
 * @returns The Leaflet module
 */
export function leaflet(): LeafletModule {
    if (!loaded) { throw new Error('Leaflet used before loadLeaflet() resolved'); }
    return loaded;
}
