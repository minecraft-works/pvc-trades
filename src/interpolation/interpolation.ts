/**
 * Player Position Interpolation (Predictive Lerp)
 *
 * Pure math functions for smooth player marker movement between
 * polled positions. Uses velocity estimation and linear extrapolation
 * to predict player positions between server updates.
 *
 * @module interpolation/interpolation
 */

// ============================================================================
// Types
// ============================================================================

/** 2D velocity vector in blocks per millisecond */
export interface Velocity2D {
    /** X velocity in blocks/ms */
    vx: number;
    /** Z velocity in blocks/ms */
    vz: number;
}

/** 2D position used for interpolation */
export interface Position2D {
    x: number;
    z: number;
}

/** 3D position with optional yaw, used for full interpolation */
export interface InterpolatedPosition {
    x: number;
    y: number;
    z: number;
    /** Interpolated yaw in Minecraft degrees (0=south, 90=west, 180=north, 270=east) */
    yaw?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Minecraft walking speed is ~4.3 blocks/sec = 0.0043 blocks/ms */
const MAX_SPEED_BLOCKS_PER_MS = 0.012; // ~12 blocks/sec covers sprinting + speed effects

// ============================================================================
// Public API
// ============================================================================

/**
 * Estimate velocity from two position samples.
 * Clamps to maximum plausible Minecraft speed to reject teleports.
 *
 * @param previous - Previous position
 * @param current - Current position
 * @param dtMs - Time delta in milliseconds (must be > 0)
 * @returns Velocity vector, or zero velocity if dt is 0 or speed exceeds plausible maximum
 *
 * @example
 * const v = estimateVelocity({ x: 0, z: 0 }, { x: 10, z: 0 }, 1000);
 * // v = { vx: 0.01, vz: 0 } (10 blocks/s → 0.01 blocks/ms)
 */
export function estimateVelocity(previous: Position2D, current: Position2D, dtMs: number): Velocity2D {
    if (dtMs <= 0) { return { vx: 0, vz: 0 }; }

    const vx = (current.x - previous.x) / dtMs;
    const vz = (current.z - previous.z) / dtMs;
    const speed = Math.hypot(vx, vz);

    // Reject implausible speeds (teleports, dimension changes)
    if (speed > MAX_SPEED_BLOCKS_PER_MS) {
        return { vx: 0, vz: 0 };
    }

    return { vx, vz };
}

/**
 * Extrapolate a position forward using velocity and time delta.
 * Pure linear extrapolation: position += velocity × time.
 *
 * @param position - Starting position
 * @param velocity - Velocity vector
 * @param dtMs - Time to extrapolate forward (milliseconds)
 * @returns Extrapolated position
 *
 * @example
 * const pos = extrapolatePosition({ x: 100, z: 200 }, { vx: 0.01, vz: -0.005 }, 500);
 * // pos = { x: 105, z: 197.5 }
 */
export function extrapolatePosition(position: Position2D, velocity: Velocity2D, dtMs: number): Position2D {
    return {
        x: position.x + velocity.vx * dtMs,
        z: position.z + velocity.vz * dtMs
    };
}

/**
 * Linearly interpolate between two positions.
 * t=0 returns `a`, t=1 returns `b`, t=0.5 returns midpoint.
 *
 * @param a - Start position
 * @param b - End position
 * @param t - Interpolation factor (0 to 1, clamped)
 * @returns Interpolated position
 *
 * @example
 * lerpPosition({ x: 0, z: 0 }, { x: 10, z: 20 }, 0.5)
 * // { x: 5, z: 10 }
 */
export function lerpPosition(a: Position2D, b: Position2D, t: number): Position2D {
    const clamped = Math.max(0, Math.min(1, t));
    return {
        x: a.x + (b.x - a.x) * clamped,
        z: a.z + (b.z - a.z) * clamped
    };
}

/**
 * Linearly interpolate between two angles (in degrees), handling wrap-around.
 * Chooses the shortest rotation direction (e.g., 350° → 10° goes through 0°).
 *
 * @param a - Start angle in degrees
 * @param b - End angle in degrees
 * @param t - Interpolation factor (0 to 1, clamped)
 * @returns Interpolated angle in degrees [0, 360)
 *
 * @example
 * lerpAngle(350, 10, 0.5)  // 0 (shortest path through 360/0)
 * lerpAngle(10, 350, 0.5)  // 0 (same, other direction)
 * lerpAngle(0, 90, 0.5)    // 45
 */
export function lerpAngle(a: number, b: number, t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    // Find shortest arc
    let diff = ((b - a + 180) % 360) - 180;
    if (diff < -180) { diff += 360; }
    const result = a + diff * clamped;
    return ((result % 360) + 360) % 360;
}

/**
 * Determine whether extrapolation should be applied.
 * Returns false if the player is stationary (below speed threshold).
 *
 * @param velocity - Current velocity estimate
 * @param _yaw - Unused (reserved for future heading-based logic)
 * @param speedThreshold - Minimum speed (blocks/ms) to trigger extrapolation
 * @returns True if extrapolation is appropriate
 *
 * @example
 * shouldExtrapolate({ vx: 0.004, vz: 0 }, 270)  // true — moving
 * shouldExtrapolate({ vx: 0, vz: 0 }, 90)         // false — stationary
 */
export function shouldExtrapolate(
    velocity: Velocity2D,
    _yaw?: number,
    speedThreshold: number = 0.001
): boolean {
    const speed = Math.hypot(velocity.vx, velocity.vz);
    return speed >= speedThreshold;
}
