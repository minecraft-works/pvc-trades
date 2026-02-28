/**
 * Player Position Interpolator
 * 
 * Provides smooth position rendering between discrete 1-second API polls
 * using a critically damped spring-damper attraction model inspired by
 * Karamouzas et al. (2009) "Indicative routes for path planning and
 * crowd simulation".
 * 
 * Following §4.3 of the paper, the attraction point is always the last
 * observed server position — never extrapolated beyond it. The spring
 * force is always > 0 unless the marker is at the target with zero
 * velocity, producing naturally smooth, overshoot-free motion.
 * 
 * Critical damping (ζ = 1.0) guarantees monotonic convergence:
 * the display marker approaches the attraction point as fast as
 * possible without oscillation or overshoot.
 * 
 * Designed as a per-player instance so it can be used for both the
 * navigating player and any player on the shop map.
 * 
 * Architecture:
 * 1. On each API poll, feed the new position via `pushSample()`
 * 2. Call `getDisplayPosition(now)` from a `requestAnimationFrame` loop
 *    to get the smoothly interpolated position at any instant
 * 3. The interpolator handles:
 *    - Spring attraction: continuously pulls display toward last observation
 *    - Teleport snapping: instant snap for implausible speed transitions
 *    - Yaw interpolation: shortest-path angular lerp via spring t factor
 * 
 * @module stores/player-interpolator
 * @see ADR-011
 */

import {
    estimateVelocity,
    type InterpolatedPosition,
    lerpAngle,
    type Position2D,
    SPRING_DAMPING,
    SPRING_STIFFNESS,
    springStep,
    type Velocity2D
} from '../interpolation/interpolation.js';

// ============================================================================
// Configuration
// ============================================================================

/** Maximum time since last sample before spring stops updating (prevents runaway) */
const MAX_TRACKING_MS = 3000;

/** Distance threshold for teleport snap (blocks). If the new sample is this far
 *  from the display position, snap instantly instead of springing. */
const TELEPORT_SNAP_DISTANCE = 50;

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
type Phase = 'idle' | 'tracking';

// ============================================================================
// PlayerInterpolator
// ============================================================================

/**
 * Smooth position interpolator for a single player.
 * 
 * Feed API samples with `pushSample()`, read display position with `getDisplayPosition()`.
 * Call `getDisplayPosition()` from `requestAnimationFrame` for fluid 60fps rendering.
 * 
 * Uses a spring-damper model: the display marker is continuously attracted toward
 * the last observed server position (the "attraction point" per Karamouzas §4.3).
 * When a new sample arrives, the attraction point updates — no phase transitions
 * or lerp seams. Critical damping ensures the display converges to the target
 * monotonically without overshoot.
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
    /** Current estimated velocity from server samples */
    private _velocity: Velocity2D = { vx: 0, vz: 0 };

    /** Last confirmed position from API */
    private _lastSample: PositionSample | undefined;

    /** Previous confirmed position from API (for velocity estimation) */
    private _prevSample: PositionSample | undefined;

    /** Current phase of the interpolator */
    private _phase: Phase = 'idle';

    /** Display position maintained by the spring (XZ) */
    private _displayPosition: Position2D = { x: 0, z: 0 };

    /** Display velocity maintained by the spring (blocks/ms) */
    private _displayVelocity: Velocity2D = { vx: 0, vz: 0 };

    /** Display Y coordinate (lerped separately, no spring) */
    private _displayY = 0;

    /** Last frame time used to compute dt for spring step */
    private _lastFrameTime = 0;

    /** Last known yaw from the most recent sample */
    private _yaw: number | undefined;

    /** Previous yaw for shortest-path yaw interpolation */
    private _prevYaw: number | undefined;

    /** Timestamp when the last sample arrived (for yaw lerp progress) */
    private _sampleArrivalTime = 0;

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
            // Estimate velocity from the two most recent true samples
            const dt = now - this._lastSample.timestamp;
            this._velocity = estimateVelocity(this._lastSample, sample, dt);

            // Teleport snap: if the new sample is very far from display, snap instantly
            const dx = sample.x - this._displayPosition.x;
            const dz = sample.z - this._displayPosition.z;
            if (Math.hypot(dx, dz) > TELEPORT_SNAP_DISTANCE) {
                this._displayPosition = { x: sample.x, z: sample.z };
                this._displayVelocity = { vx: 0, vz: 0 };
                this._displayY = sample.y;
            }

            this._phase = 'tracking';
        } else {
            // First sample — snap to position, no spring history
            this._velocity = { vx: 0, vz: 0 };
            this._displayPosition = { x: sample.x, z: sample.z };
            this._displayVelocity = { vx: 0, vz: 0 };
            this._displayY = sample.y;
            this._phase = 'idle';
        }

        this._prevSample = this._lastSample;
        this._prevYaw = this._yaw;
        this._lastSample = sample;
        this._yaw = sample.yaw;
        this._sampleArrivalTime = now;
        this._lastFrameTime = now;
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

        if (this._phase === 'idle') {
            // Only one sample received — return exact position
            return {
                x: this._lastSample.x,
                y: this._lastSample.y,
                z: this._lastSample.z,
                yaw: this._lastSample.yaw
            };
        }

        // --- Tracking phase: run spring step ---
        const elapsed = now - this._lastSample.timestamp;

        // Attraction point: the last observed server position (per Karamouzas §4.3).
        // No extrapolation beyond the observation — the display converges to this
        // point and rests there until a new sample arrives.
        const target: Position2D = { x: this._lastSample.x, z: this._lastSample.z };

        // Compute dt since last frame
        const dtMs = now - this._lastFrameTime;
        this._lastFrameTime = now;

        if (dtMs > 0 && elapsed <= MAX_TRACKING_MS) {
            // Run spring step
            const result = springStep(
                this._displayPosition,
                target,
                this._displayVelocity,
                { stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING, dtMs }
            );
            this._displayPosition = result.position;
            this._displayVelocity = result.velocity;
        }
        // If elapsed > MAX_TRACKING_MS, freeze (no spring update)

        // Lerp Y toward last sample Y (simple exponential approach)
        const yTarget = this._lastSample.y;
        const yDt = Math.min(dtMs, 200);
        const yAlpha = 1 - Math.exp(-10 * yDt / 1000); // ~200ms to 95% convergence
        this._displayY = this._displayY + (yTarget - this._displayY) * yAlpha;

        // Yaw: shortest-path lerp based on time since sample arrival
        const yaw = this._interpolateYaw(now);

        return {
            x: this._displayPosition.x,
            y: this._displayY,
            z: this._displayPosition.z,
            yaw
        };
    }

    /**
     * Get the most recent confirmed (non-interpolated) position.
     * Use this for authoritative checks like auto-advance distance.
     * @returns The last confirmed position sample, or undefined if no samples received
     */
    get lastConfirmedPosition(): PositionSample | undefined {
        return this._lastSample;
    }

    /**
     * Current estimated velocity vector
     * @returns The estimated velocity in blocks per millisecond
     */
    get velocity(): Velocity2D {
        return this._velocity;
    }

    /**
     * Current interpolation phase
     * @returns The active interpolation phase ('idle' or 'tracking')
     */
    get phase(): Phase {
        return this._phase;
    }

    /**
     * Last known yaw
     * @returns The most recent yaw angle in degrees, or undefined if unknown
     */
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
        this._displayPosition = { x: 0, z: 0 };
        this._displayVelocity = { vx: 0, vz: 0 };
        this._displayY = 0;
        this._lastFrameTime = 0;
        this._yaw = undefined;
        this._prevYaw = undefined;
        this._sampleArrivalTime = 0;
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Interpolate yaw between previous and current sample using shortest path.
     * Uses time-based progress over 200ms for smooth rotation.
     * @param now - Current timestamp in milliseconds
     * @returns Interpolated yaw angle in degrees, or undefined if insufficient data
     */
    private _interpolateYaw(now: number): number | undefined {
        const fromYaw = this._prevYaw;
        const toYaw = this._lastSample?.yaw;
        if (fromYaw === undefined || toYaw === undefined) { return toYaw ?? fromYaw; }

        const elapsed = now - this._sampleArrivalTime;
        const t = Math.min(1, elapsed / 200); // 200ms yaw transition
        return lerpAngle(fromYaw, toYaw, t);
    }
}
