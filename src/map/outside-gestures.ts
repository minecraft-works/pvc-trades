/**
 * Pan and pinch the round shop map from anywhere on the screen.
 *
 * Leaflet only listens to its own (round) container. On a phone the map is
 * small, so gestures that start on the dark area around it also move the
 * map: one finger pans, two fingers pinch-zoom (also with one finger on the
 * map and one outside), and the mouse wheel zooms on desktop. A single tap
 * outside still closes the dialog (see `setupDialogBackdropClose`); after a
 * drag or pinch it doesn't.
 *
 * @module map/outside-gestures
 */

import type * as L from 'leaflet';

import { leaflet } from './leaflet.js';
import { getPinchZoomDelta, measurePointers, type PointerSpread, type ScreenPoint } from './map-math.js';

/** Most a press may move and still count as a tap, in pixels */
const TAP_SLOP_PX = 6;
/** Zoom levels per pixel of wheel scroll: one 100 px notch is a third of a level */
const WHEEL_ZOOM_PER_PX = 1 / 300;
/** Pixels per line for wheels that scroll by lines (Firefox) */
const WHEEL_LINE_PX = 16;

/**
 * Move the map so the spot under `from` ends up under `to`, zoomed by `zoomDelta`.
 * @param map - Leaflet map
 * @param from - Container point at the previous step
 * @param to - Container point now
 * @param zoomDelta - Zoom change
 */
function moveMap(map: L.Map, from: L.Point, to: L.Point, zoomDelta: number): void {
    if (zoomDelta === 0) {
        map.panBy(from.subtract(to), { animate: false });
        return;
    }
    const zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + zoomDelta));
    const anchor = map.containerPointToLatLng(from);
    const center = map.project(anchor, zoom).subtract(to.subtract(map.getSize().divideBy(2)));
    map.setView(map.unproject(center, zoom), zoom, { animate: false });
}

/**
 * Let gestures that start outside the round map move it.
 * @param dialog - Map dialog
 * @param getMap - Current Leaflet map, if open
 */
export function setupOutsideGestures(dialog: HTMLDialogElement, getMap: () => L.Map | undefined): void {
    if (Object.hasOwn(dialog.dataset, 'outsideGestures')) { return; }
    dialog.dataset.outsideGestures = 'true';

    /** Every pointer that is down, wherever it started */
    const pointers = new Map<number, ScreenPoint>();
    /** Set while a gesture that started outside the map moves it */
    let gesture: { map: L.Map; origin: ScreenPoint; last: PointerSpread; count: number; moved: boolean; rect: DOMRect } | undefined;
    let frame: number | undefined;
    let suppressClick = false;

    const toContainer = (point: ScreenPoint, rect: DOMRect): L.Point => leaflet().point(point.x - rect.left, point.y - rect.top);

    function step(): void {
        frame = undefined;
        if (!gesture) { return; }
        const now = measurePointers([...pointers.values()]);
        // A finger added or lifted: measure from here on, without a jump
        if (pointers.size !== gesture.count) {
            gesture.count = pointers.size;
            gesture.last = now;
            return;
        }
        const zoomDelta = pointers.size >= 2 ? getPinchZoomDelta(gesture.last.spread, now.spread) : 0;
        moveMap(gesture.map, toContainer(gesture.last.center, gesture.rect), toContainer(now.center, gesture.rect), zoomDelta);
        gesture.last = now;
    }

    function start(map: L.Map): void {
        // Leaflet's own drag or pinch (a finger already on the map) would fight this one
        map.dragging.disable();
        map.touchZoom.disable();
        const now = measurePointers([...pointers.values()]);
        const rect = map.getContainer().getBoundingClientRect();
        gesture = { map, rect, origin: now.center, last: now, count: pointers.size, moved: pointers.size >= 2 };
    }

    function end(): void {
        if (!gesture) { return; }
        const { map, moved } = gesture;
        gesture = undefined;
        if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
        map.dragging.enable();
        map.touchZoom.enable();
        // The release after a drag or pinch is not a tap on the backdrop
        suppressClick = moved;
    }

    document.addEventListener('pointerdown', event => {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        suppressClick = false;
        if (!dialog.open) { return; }
        if (gesture) {
            gesture.moved ||= pointers.size >= 2;
            return;
        }
        // Only presses on the dialog itself: the backdrop and around the round map
        const map = getMap();
        if (event.target !== dialog || !map) { return; }
        dialog.setPointerCapture(event.pointerId);
        start(map);
    }, { capture: true });

    document.addEventListener('pointermove', event => {
        if (!pointers.has(event.pointerId)) { return; }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (!gesture) { return; }
        if (!gesture.moved) {
            const center = measurePointers([...pointers.values()]).center;
            gesture.moved = Math.hypot(center.x - gesture.origin.x, center.y - gesture.origin.y) > TAP_SLOP_PX;
            if (!gesture.moved) { return; }
        }
        frame ??= requestAnimationFrame(step);
    }, { capture: true });

    const release = (event: PointerEvent): void => {
        pointers.delete(event.pointerId);
        if (gesture && pointers.size === 0) { end(); }
    };
    document.addEventListener('pointerup', release, { capture: true });
    document.addEventListener('pointercancel', release, { capture: true });

    dialog.addEventListener('click', event => {
        if (!suppressClick) { return; }
        suppressClick = false;
        event.stopImmediatePropagation();
    }, { capture: true });

    // Mouse wheel on the backdrop zooms around the pointer
    dialog.addEventListener('wheel', event => {
        const map = getMap();
        if (event.target !== dialog || !map) { return; }
        event.preventDefault();
        const rect = map.getContainer().getBoundingClientRect();
        const point = toContainer({ x: event.clientX, y: event.clientY }, rect);
        const deltaPx = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
        moveMap(map, point, point, -deltaPx * WHEEL_ZOOM_PER_PX);
    }, { passive: false });
}
