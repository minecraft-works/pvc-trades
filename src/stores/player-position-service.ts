/**
 * Player Position Service
 *
 * A high-level abstraction layer over the spring-damper interpolation system.
 * Any feature can sample the smoothly interpolated position of any tracked
 * player at any point in time — no knowledge of interpolation internals required.
 *
 * Feed raw API poll data with {@link PlayerPositionService.pushSample pushSample()},
 * then call {@link PlayerPositionService.getCurrentPosition getCurrentPosition()} or
 * {@link PlayerPositionService.getPositionAt getPositionAt()} from any context
 * (animation loop, map centering, tooltips, distance calculations, etc.)
 * to get the spring-damped position at that instant.
 *
 * Architecture:
 * ```
 * API poll (500ms) ──► pushSample(name, pos)
 *                                │
 *                      PlayerPositionService
 *                       ┌────────┴────────┐
 *                       │  per-player      │
 *                       │  PlayerInterpolator  │
 *                       │  (spring-damper)  │
 *                       └────────┬────────┘
 *                                │
 *         ┌──────────┬───────────┼──────────┬──────────┐
 *         ▼          ▼           ▼          ▼          ▼
 *      marker    map center   tooltip   distance   any future
 *      60fps     60fps        on-demand  on-demand  feature
 * ```
 *
 * @module stores/player-position-service
 * @see ADR-011
 */

import type { InterpolatedPosition, Velocity2D } from '../interpolation/interpolation.js';
import { PlayerInterpolator, type PositionSample } from './player-interpolator.js';

// ============================================================================
// PlayerPositionService
// ============================================================================

/**
 * Manages interpolated player positions. Feed raw API data, sample
 * smooth positions on demand from any feature.
 *
 * @example
 * ```typescript
 * // Producer (poll loop): feed raw data
 * playerPositionService.pushSample('Steve', { x: 100, y: 64, z: 200, timestamp: now });
 *
 * // Consumer (any feature): sample whenever needed
 * const pos = playerPositionService.getCurrentPosition('Steve');
 * if (pos) { marker.setLatLng(toLeaflet(pos.x, pos.z)); }
 *
 * // Time-specific sampling (animation loop):
 * const pos = playerPositionService.getPositionAt('Steve', performance.now());
 * ```
 */
export class PlayerPositionService {
    /** Map of player name (lowercase) → interpolator instance */
    private readonly _interpolators = new Map<string, PlayerInterpolator>();

    // ====================================================================
    // Data input
    // ====================================================================

    /**
     * Feed a new position sample from the API.
     * Creates the interpolator on first call for a given player.
     *
     * @param playerName - Case-insensitive player name
     * @param sample - Position sample with timestamp
     */
    pushSample(playerName: string, sample: PositionSample): void {
        this._getOrCreate(playerName).pushSample(sample);
    }

    // ====================================================================
    // Position sampling
    // ====================================================================

    /**
     * Get the interpolated position at a specific timestamp.
     * Use this in animation loops where you already have a timestamp.
     *
     * @param playerName - Case-insensitive player name
     * @param timestamp - Timestamp in ms (same timebase as sample timestamps)
     * @returns Interpolated position, or undefined if player not tracked
     */
    getPositionAt(playerName: string, timestamp: number): InterpolatedPosition | undefined {
        return this._interpolators.get(playerName.toLowerCase())?.getDisplayPosition(timestamp);
    }

    /**
     * Get the interpolated position right now.
     * Convenience wrapper over {@link getPositionAt} using `performance.now()`.
     *
     * @param playerName - Case-insensitive player name
     * @returns Interpolated position, or undefined if player not tracked
     */
    getCurrentPosition(playerName: string): InterpolatedPosition | undefined {
        return this.getPositionAt(playerName, performance.now());
    }

    /**
     * Get the last confirmed (non-interpolated) server position.
     * Use for authoritative checks like auto-advance distance.
     *
     * @param playerName - Case-insensitive player name
     */
    getLastConfirmedPosition(playerName: string): PositionSample | undefined {
        return this._interpolators.get(playerName.toLowerCase())?.lastConfirmedPosition;
    }

    // ====================================================================
    // Lifecycle management
    // ====================================================================

    /**
     * Reset a player's interpolation state.
     * Use when the player crosses a portal or teleports — the next
     * {@link pushSample} will start fresh interpolation.
     *
     * @param playerName - Case-insensitive player name
     */
    resetPlayer(playerName: string): void {
        this._interpolators.get(playerName.toLowerCase())?.reset();
    }

    /**
     * Remove a player's interpolator entirely.
     * Use when navigation stops or a player leaves.
     *
     * @param playerName - Case-insensitive player name
     */
    removePlayer(playerName: string): void {
        const key = playerName.toLowerCase();
        const interpolator = this._interpolators.get(key);
        if (interpolator) {
            interpolator.reset();
            this._interpolators.delete(key);
        }
    }

    /**
     * Remove all tracked players.
     * Use when stopping navigation or closing map dialogs.
     */
    clear(): void {
        for (const interpolator of this._interpolators.values()) {
            interpolator.reset();
        }
        this._interpolators.clear();
    }

    // ====================================================================
    // Inspection (debug / testing)
    // ====================================================================

    /** Get interpolation phase for a player ('idle' | 'tracking') */
    getPhase(playerName: string): string | undefined {
        return this._interpolators.get(playerName.toLowerCase())?.phase;
    }

    /** Get the current estimated velocity for a player */
    getVelocity(playerName: string): Velocity2D | undefined {
        return this._interpolators.get(playerName.toLowerCase())?.velocity;
    }

    /** Get all tracked player names (lowercase) */
    getPlayerNames(): string[] {
        return [...this._interpolators.keys()];
    }

    /** Number of tracked players */
    get size(): number {
        return this._interpolators.size;
    }

    // ====================================================================
    // Internal
    // ====================================================================

    /** Get or create an interpolator for a player */
    private _getOrCreate(playerName: string): PlayerInterpolator {
        const key = playerName.toLowerCase();
        let interpolator = this._interpolators.get(key);
        if (!interpolator) {
            interpolator = new PlayerInterpolator();
            this._interpolators.set(key, interpolator);
        }
        return interpolator;
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Global player position service — single source of interpolated player data */
export const playerPositionService = new PlayerPositionService();
