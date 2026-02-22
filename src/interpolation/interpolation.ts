/**
 * Player Position Interpolation (Spring-Damper Attraction)
 *
 * Pure math functions for smooth player marker movement between
 * polled positions. Uses a critically damped spring-damper model
 * inspired by Karamouzas et al. (2009) "Indicative routes for
 * path planning and crowd simulation" — the display marker is
 * continuously attracted toward the last observed server position
 * (the "attraction point"), converging smoothly without overshoot.
 *
 * Key principle from §4.3: the attraction point is always the last
 * observed position (never extrapolated beyond it). The force is
 * always > 0 unless the marker has reached the target with zero
 * velocity. This guarantees monotonic convergence — overshoot is
 * mathematically impossible with critical damping (ζ = 1.0).
 *
 * @module interpolation/interpolation
 * @see ADR-011
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

/** Result of a single spring-damper integration step */
export interface SpringResult {
    /** Updated display position */
    position: Position2D;
    /** Updated display velocity (blocks/ms) */
    velocity: Velocity2D;
}

/** Configuration for a spring-damper integration step */
export interface SpringConfig {
    /** Spring stiffness k (1/s²) */
    stiffness: number;
    /** Damping coefficient (1/s) */
    damping: number;
    /** Timestep in milliseconds (clamped to MAX_STEP_MS internally) */
    dtMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Minecraft walking speed is ~4.3 blocks/sec = 0.0043 blocks/ms */
const MAX_SPEED_BLOCKS_PER_MS = 0.012; // ~12 blocks/sec covers sprinting + speed effects

/**
 * Spring stiffness (k) in 1/s².
 * Controls how aggressively the display marker accelerates toward the target.
 * Higher values → snappier convergence but more energy in the system.
 *
 * With k=25, ω_n = √25 = 5 rad/s → ~0.8s to 98% convergence (critically damped).
 */
export const SPRING_STIFFNESS = 25;

/**
 * Spring damping coefficient in 1/s.
 * Critical damping = 2·√k = 2·5 = 10 for k=25.
 * ζ = c / (2·√k) = 10 / 10 = 1.0 → critically damped (no overshoot).
 */
export const SPRING_DAMPING = 10;

/** Maximum dt per integration step (ms). Caps large gaps to prevent instability. */
const MAX_STEP_MS = 100;

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
 * Advance a spring-damper system by one timestep.
 *
 * Uses semi-implicit Euler integration (symplectic — update velocity first,
 * then position with the new velocity) which is stable for oscillatory
 * systems and preserves energy better than explicit Euler.
 *
 * The spring force continuously pulls the display position toward the
 * target: `F = k·(target − display) − damping·v_display`. When the
 * display reaches the target with zero velocity, the net force is zero
 * and the system rests naturally — no phase transitions needed.
 *
 * Physics is computed in blocks/second internally (converted at boundaries)
 * since stiffness/damping constants are expressed in per-second units.
 *
 * Large timesteps (>100ms) are clamped to prevent instability from frame
 * drops or background tabs.
 *
 * @param displayPos - Current display position
 * @param targetPos - Target position to attract toward
 * @param displayVelocity - Current display velocity (blocks/ms)
 * @param config - Spring configuration (stiffness, damping, timestep)
 * @returns Updated position and velocity
 *
 * @example
 * const result = springStep(
 *     { x: 0, z: 0 },        // display is at origin
 *     { x: 10, z: 0 },       // target is 10 blocks east
 *     { vx: 0, vz: 0 },      // display is stationary
 *     { stiffness: 25, damping: 10, dtMs: 16 }
 * );
 * // result.position.x ≈ 0.064 (pulled toward target)
 */
export function springStep(
    displayPos: Position2D,
    targetPos: Position2D,
    displayVelocity: Velocity2D,
    config: SpringConfig
): SpringResult {
    const { stiffness, damping, dtMs } = config;
    // Clamp dt to prevent instability from large gaps
    const clampedDt = Math.min(Math.max(0, dtMs), MAX_STEP_MS);
    const dt = clampedDt / 1000; // convert to seconds

    // Convert velocity to blocks/sec for physics
    const vxSec = displayVelocity.vx * 1000;
    const vzSec = displayVelocity.vz * 1000;

    // Displacement from display to target
    const dx = targetPos.x - displayPos.x;
    const dz = targetPos.z - displayPos.z;

    // Acceleration = spring force − damping force (mass = 1)
    const ax = stiffness * dx - damping * vxSec;
    const az = stiffness * dz - damping * vzSec;

    // Semi-implicit Euler: update velocity first, then position
    const newVxSec = vxSec + ax * dt;
    const newVzSec = vzSec + az * dt;

    const newX = displayPos.x + newVxSec * dt;
    const newZ = displayPos.z + newVzSec * dt;

    return {
        position: { x: newX, z: newZ },
        velocity: { vx: newVxSec / 1000, vz: newVzSec / 1000 } // back to blocks/ms
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
