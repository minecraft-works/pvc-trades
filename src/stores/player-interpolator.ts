/**
 * Player Position Interpolator
 * 
 * Provides smooth position rendering between discrete 1-second API polls
 * using predictive lerp (dead reckoning + smooth correction).
 * 
 * Designed as a per-player instance so it can be used for both the
 * navigating player and any player on the shop map.
 * 
 * Architecture:
 * 1. On each API poll, feed the new position via `pushSample()`
 * 2. Call `getDisplayPosition(now)` from a `requestAnimationFrame` loop
 *    to get the smoothly interpolated position at any instant
 * 3. The interpolator handles:
 *    - Correction phase: lerps from predicted-but-wrong → true position (~200ms)
 *    - Extrapolation phase: dead reckons forward using estimated velocity
 *    - Yaw validation: suppresses extrapolation when heading diverges from velocity
 * 
 * @module stores/player-interpolator
 * @see ADR-011
 */

import {
    estimateVelocity,
    extrapolatePosition,
    type InterpolatedPosition,
    lerpAngle,
    lerpPosition,
    type Position2D,
    shouldExtrapolate,
    type Velocity2D
} from '../library.js';

// ============================================================================
// Configuration
// ============================================================================

/** Duration in ms to lerp from predicted position to actual on correction */
const CORRECTION_DURATION_MS = 200;

/** Maximum extrapolation time before freezing (prevents runaway if polls stop) */
const MAX_EXTRAPOLATION_MS = 3000;

// ============================================================================
// Types
// ============================================================================

/** A position sample received from the API */
export interface PositionSample {
    x: number;
    y: number;
    z: number;
    /** Minecraft yaw (0=south, 90=west, 180=north, 270=east) */
    yaw?: number;
    /** Timestamp when sample was received (ms, from performance.now or Date.now) */
    timestamp: number;
}

/** Interpolation phase */
type Phase = 'idle' | 'correcting' | 'extrapolating';

// ============================================================================
// PlayerInterpolator
// ============================================================================

/**
 * Smooth position interpolator for a single player.
 * 
 * Feed API samples with `pushSample()`, read display position with `getDisplayPosition()`.
 * Call `getDisplayPosition()` from `requestAnimationFrame` for fluid 60fps rendering.
 * 
 * @example
 * ```typescript
 * const interpolator = new PlayerInterpolator();
 * 
 * // On each API poll:
 * interpolator.pushSample({ x: 100, z: 200, yaw: 90, timestamp: performance.now() });
 * 
 * // In rAF loop:
 * const { x, y, z, yaw } = interpolator.getDisplayPosition(performance.now());
 * marker.setLatLng(toLeaflet(x, z));
 * ```
 */
export class PlayerInterpolator {
    /** Current estimated velocity */
    private _velocity: Velocity2D = { vx: 0, vz: 0 };

    /** Last confirmed position from API */
    private _lastSample: PositionSample | undefined;

    /** Previous confirmed position from API (for velocity estimation) */
    private _prevSample: PositionSample | undefined;

    /** Current phase of the interpolator */
    private _phase: Phase = 'idle';

    /** Position where correction lerp starts (the "wrong" predicted position) */
    private _correctionStart: Position2D | undefined;

    /** Position where correction lerp ends (the new true position) */
    private _correctionTarget: Position2D | undefined;

    /** Y value at the start of correction (from predicted position) */
    private _correctionStartY: number | undefined;

    /** Timestamp when correction phase began */
    private _correctionStartTime = 0;

    /** Last yaw from the most recent sample */
    private _yaw: number | undefined;

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Feed a new position sample from the API.
     * Should be called once per poll cycle (~500ms).
     * 
     * @param sample - New position sample with timestamp
     */
    pushSample(sample: PositionSample): void {
        const now = sample.timestamp;

        if (this._lastSample) {
            // Calculate where we predicted the player would be at this moment
            const predictedNow = this._getExtrapolatedPosition(now);

            // Estimate velocity from the two most recent true samples
            const dt = now - this._lastSample.timestamp;
            this._velocity = estimateVelocity(this._lastSample, sample, dt);

            // Start correction from our (possibly wrong) predicted position to the true position
            this._correctionStart = { x: predictedNow.x, z: predictedNow.z };
            this._correctionStartY = predictedNow.y;
            this._correctionTarget = { x: sample.x, z: sample.z };
            this._correctionStartTime = now;
            this._phase = 'correcting';
        } else {
            // First sample — no prediction possible
            this._velocity = { vx: 0, vz: 0 };
            this._phase = 'idle';
        }

        this._prevSample = this._lastSample;
        this._lastSample = sample;
        this._yaw = sample.yaw;
    }

    /**
     * Get the smoothly interpolated display position at a given time.
     * Call this from `requestAnimationFrame` for 60fps updates.
     * 
     * @param now - Current timestamp (ms, same timebase as sample timestamps)
     * @returns Interpolated position with y and yaw, or undefined if no samples received yet
     */
    getDisplayPosition(now: number): InterpolatedPosition | undefined {
        if (!this._lastSample) { return undefined; }

        if (this._phase === 'correcting') {
            return this._getCorrectedPosition(now);
        }

        if (this._phase === 'extrapolating') {
            return this._getExtrapolatedPosition(now);
        }

        // Idle — return last known position
        return {
            x: this._lastSample.x,
            y: this._lastSample.y,
            z: this._lastSample.z,
            yaw: this._lastSample.yaw
        };
    }

    /**
     * Get the most recent confirmed (non-interpolated) position.
     * Use this for authoritative checks like auto-advance distance.
     */
    get lastConfirmedPosition(): PositionSample | undefined {
        return this._lastSample;
    }

    /** Current estimated velocity vector */
    get velocity(): Velocity2D {
        return this._velocity;
    }

    /** Current interpolation phase */
    get phase(): Phase {
        return this._phase;
    }

    /** Last known yaw */
    get yaw(): number | undefined {
        return this._yaw;
    }

    /**
     * Reset the interpolator state.
     * Use when navigation stops or player changes.
     */
    reset(): void {
        this._velocity = { vx: 0, vz: 0 };
        this._lastSample = undefined;
        this._prevSample = undefined;
        this._phase = 'idle';
        this._correctionStart = undefined;
        this._correctionTarget = undefined;
        this._correctionStartY = undefined;
        this._correctionStartTime = 0;
        this._yaw = undefined;
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Get position during the correction phase.
     * Lerps from predicted-but-wrong position toward the extrapolated path,
     * then transitions seamlessly to pure extrapolation.
     *
     * The correction target is a **moving target**: the sample position
     * extrapolated forward by the current velocity. This ensures the lerp
     * converges to exactly where the extrapolation phase would be at t=1,
     * eliminating a position discontinuity at the transition. It also keeps
     * the marker tracking a fast-moving player during the correction window
     * instead of lagging behind the stale sample position.
     */
    private _getCorrectedPosition(now: number): InterpolatedPosition {
        const elapsed = now - this._correctionStartTime;
        const t = elapsed / CORRECTION_DURATION_MS;

        if (t >= 1) {
            // Correction complete → switch to extrapolation
            this._phase = 'extrapolating';
            return this._getExtrapolatedPosition(now);
        }

        // Move the correction target forward with velocity so the lerp
        // converges smoothly to the extrapolated path (no jump at t=1).
        if (!this._lastSample || !this._correctionTarget || !this._correctionStart) {
            return { x: 0, z: 0, y: 0 };
        }
        const timeSinceSample = now - this._lastSample.timestamp;
        const movingTarget = extrapolatePosition(
            this._correctionTarget,
            this._velocity,
            timeSinceSample
        );

        // Lerp from wrong prediction to moving target (x, z)
        const pos2d = lerpPosition(this._correctionStart, movingTarget, t);

        // Lerp Y linearly
        const fromY = this._correctionStartY ?? this._lastSample.y;
        const toY = this._lastSample.y;
        const y = fromY + (toY - fromY) * Math.max(0, Math.min(1, t));

        // Lerp yaw via shortest path
        const yaw = this._interpolateYaw(t);

        return { x: pos2d.x, z: pos2d.z, y, yaw };
    }

    /**
     * Get position during the extrapolation phase.
     * Dead reckons forward from last confirmed position using velocity.
     * Freezes after MAX_EXTRAPOLATION_MS to prevent runaway.
     */
    private _getExtrapolatedPosition(now: number): InterpolatedPosition {
        if (!this._lastSample) {
            return { x: 0, y: 0, z: 0 };
        }

        const elapsed = now - this._lastSample.timestamp;

        // Don't extrapolate beyond safety limit
        if (elapsed > MAX_EXTRAPOLATION_MS) {
            const pos = extrapolatePosition(this._lastSample, this._velocity, MAX_EXTRAPOLATION_MS);
            return { x: pos.x, y: this._lastSample.y, z: pos.z, yaw: this._lastSample.yaw };
        }

        // Check if extrapolation is appropriate (speed + yaw agreement)
        if (!shouldExtrapolate(this._velocity, this._yaw)) {
            return {
                x: this._lastSample.x,
                y: this._lastSample.y,
                z: this._lastSample.z,
                yaw: this._lastSample.yaw
            };
        }

        const pos = extrapolatePosition(this._lastSample, this._velocity, elapsed);
        return { x: pos.x, y: this._lastSample.y, z: pos.z, yaw: this._lastSample.yaw };
    }

    /**
     * Interpolate yaw between previous and current sample using shortest path.
     */
    private _interpolateYaw(t: number): number | undefined {
        const fromYaw = this._prevSample?.yaw;
        const toYaw = this._lastSample?.yaw;
        if (fromYaw === undefined || toYaw === undefined) { return toYaw ?? fromYaw; }
        return lerpAngle(fromYaw, toYaw, t);
    }
}

// ============================================================================
// Interpolator Registry
// ============================================================================

/** Map of player name (lowercase) → interpolator instance */
const interpolators = new Map<string, PlayerInterpolator>();

/**
 * Get or create a PlayerInterpolator for a given player name.
 * Interpolators persist across poll cycles but can be cleaned up with `removeInterpolator`.
 * 
 * @param playerName - Case-insensitive player name
 * @returns Existing or new interpolator for this player
 */
export function getInterpolator(playerName: string): PlayerInterpolator {
    const key = playerName.toLowerCase();
    let interpolator = interpolators.get(key);
    if (!interpolator) {
        interpolator = new PlayerInterpolator();
        interpolators.set(key, interpolator);
    }
    return interpolator;
}

/**
 * Remove and reset a specific player's interpolator.
 * 
 * @param playerName - Case-insensitive player name
 */
export function removeInterpolator(playerName: string): void {
    const key = playerName.toLowerCase();
    const interpolator = interpolators.get(key);
    if (interpolator) {
        interpolator.reset();
        interpolators.delete(key);
    }
}

/**
 * Remove all interpolators. Use when stopping navigation or closing map dialogs.
 */
export function clearAllInterpolators(): void {
    for (const interpolator of interpolators.values()) {
        interpolator.reset();
    }
    interpolators.clear();
}

/**
 * Get all active interpolators and their keys.
 * Useful for the rAF loop that updates all player markers.
 */
export function getAllInterpolators(): ReadonlyMap<string, PlayerInterpolator> {
    return interpolators;
}
