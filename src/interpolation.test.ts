/**
 * Unit tests for player position interpolation (Spring-Damper Attraction).
 * 
 * Tests the pure math functions in interpolation.ts and the PlayerInterpolator class.
 * The spring-damper model replaces the previous predictive lerp (3-phase state machine)
 * with continuous attraction toward a moving target.
 */

import { beforeEach,describe, expect, test } from 'vitest';

import {
    estimateVelocity,
    lerpAngle,
    SPRING_DAMPING,
    SPRING_STIFFNESS,
    type SpringConfig,
    springStep,
} from './library.js';
import { clearAllInterpolators, getAllInterpolators,getInterpolator, PlayerInterpolator, removeInterpolator } from './stores/player-interpolator.js';

// ============================================================================
// Pure Math Functions
// ============================================================================

describe('estimateVelocity', () => {
    test('calculates velocity from two positions', () => {
        const v = estimateVelocity({ x: 0, z: 0 }, { x: 4, z: 0 }, 1000);
        expect(v.vx).toBeCloseTo(0.004);
        expect(v.vz).toBeCloseTo(0);
    });

    test('calculates diagonal velocity', () => {
        const v = estimateVelocity({ x: 0, z: 0 }, { x: 3, z: 4 }, 1000);
        expect(v.vx).toBeCloseTo(0.003);
        expect(v.vz).toBeCloseTo(0.004);
    });

    test('returns zero velocity for zero time delta', () => {
        const v = estimateVelocity({ x: 0, z: 0 }, { x: 10, z: 10 }, 0);
        expect(v.vx).toBe(0);
        expect(v.vz).toBe(0);
    });

    test('returns zero velocity for negative time delta', () => {
        const v = estimateVelocity({ x: 0, z: 0 }, { x: 10, z: 10 }, -100);
        expect(v.vx).toBe(0);
        expect(v.vz).toBe(0);
    });

    test('rejects implausible speed (teleport)', () => {
        // 1000 blocks in 1 second = way above max speed
        const v = estimateVelocity({ x: 0, z: 0 }, { x: 1000, z: 0 }, 1000);
        expect(v.vx).toBe(0);
        expect(v.vz).toBe(0);
    });

    test('accepts sprinting speed (~6 blocks/sec)', () => {
        const v = estimateVelocity({ x: 0, z: 0 }, { x: 6, z: 0 }, 1000);
        expect(v.vx).toBeCloseTo(0.006);
        expect(v.vz).toBeCloseTo(0);
    });

    test('stationary player returns zero velocity', () => {
        const v = estimateVelocity({ x: 100, z: 200 }, { x: 100, z: 200 }, 1000);
        expect(v.vx).toBe(0);
        expect(v.vz).toBe(0);
    });
});

describe('springStep', () => {
    const defaultConfig: SpringConfig = { stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING, dtMs: 16 };

    test('zero displacement and zero velocity returns same position', () => {
        const result = springStep(
            { x: 5, z: 10 }, { x: 5, z: 10 },
            { vx: 0, vz: 0 }, defaultConfig
        );
        expect(result.position.x).toBeCloseTo(5);
        expect(result.position.z).toBeCloseTo(10);
        expect(result.velocity.vx).toBeCloseTo(0);
        expect(result.velocity.vz).toBeCloseTo(0);
    });

    test('pulls display toward target', () => {
        const result = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0, vz: 0 }, defaultConfig
        );
        expect(result.position.x).toBeGreaterThan(0);
        expect(result.velocity.vx).toBeGreaterThan(0);
    });

    test('pulls in both axes diagonally', () => {
        const result = springStep(
            { x: 0, z: 0 }, { x: 10, z: 20 },
            { vx: 0, vz: 0 }, defaultConfig
        );
        expect(result.position.x).toBeGreaterThan(0);
        expect(result.position.z).toBeGreaterThan(0);
        // Z displacement is double X displacement → proportional pull
        expect(result.position.z / result.position.x).toBeCloseTo(2, 0);
    });

    test('converges to target after many steps', () => {
        let pos = { x: 0, z: 0 };
        let vel = { vx: 0, vz: 0 };
        const target = { x: 10, z: 5 };

        // 60 steps × 16ms ≈ 1 second
        for (let index = 0; index < 60; index++) {
            const result = springStep(pos, target, vel, defaultConfig);
            pos = result.position;
            vel = result.velocity;
        }

        expect(pos.x).toBeCloseTo(10, 0);
        expect(pos.z).toBeCloseTo(5, 0);
    });

    test('damping prevents oscillation (near-critically damped)', () => {
        // Track X position over time — it should not overshoot by more than ~15%
        // (ζ ≈ 0.85 → slight underdamping, max overshoot ≈ 1-2%)
        let pos = { x: 0, z: 0 };
        let vel = { vx: 0, vz: 0 };
        const target = { x: 10, z: 0 };
        let maxX = 0;

        for (let index = 0; index < 120; index++) {
            const result = springStep(pos, target, vel, defaultConfig);
            pos = result.position;
            vel = result.velocity;
            maxX = Math.max(maxX, pos.x);
        }

        // Should not overshoot target by more than 15%
        expect(maxX).toBeLessThan(11.5);
        // Should converge close to target
        expect(pos.x).toBeCloseTo(10, 0);
    });

    test('zero dt returns unchanged position and velocity', () => {
        const result = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0.005, vz: 0 }, { stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING, dtMs: 0 }
        );
        expect(result.position.x).toBe(0);
        expect(result.position.z).toBe(0);
        expect(result.velocity.vx).toBe(0.005);
    });

    test('large dt is clamped to prevent instability', () => {
        // 5000ms dt should be clamped to MAX_STEP_MS (100ms)
        const resultLarge = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0, vz: 0 }, { stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING, dtMs: 5000 }
        );
        const resultClamped = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0, vz: 0 }, { stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING, dtMs: 100 }
        );
        expect(resultLarge.position.x).toBeCloseTo(resultClamped.position.x);
        expect(resultLarge.velocity.vx).toBeCloseTo(resultClamped.velocity.vx);
    });

    test('higher stiffness produces stronger pull', () => {
        const weak = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0, vz: 0 }, { stiffness: 10, damping: 6, dtMs: 16 }
        );
        const strong = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0, vz: 0 }, { stiffness: 50, damping: 14, dtMs: 16 }
        );
        expect(strong.position.x).toBeGreaterThan(weak.position.x);
    });

    test('existing velocity toward target adds to spring pull', () => {
        const withVel = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0.005, vz: 0 }, defaultConfig
        );
        const noVel = springStep(
            { x: 0, z: 0 }, { x: 10, z: 0 },
            { vx: 0, vz: 0 }, defaultConfig
        );
        expect(withVel.position.x).toBeGreaterThan(noVel.position.x);
    });
});

describe('lerpAngle', () => {
    test('t=0 returns from angle', () => {
        expect(lerpAngle(30, 90, 0)).toBeCloseTo(30);
    });

    test('t=1 returns to angle', () => {
        expect(lerpAngle(30, 90, 1)).toBeCloseTo(90);
    });

    test('t=0.5 returns midpoint', () => {
        expect(lerpAngle(0, 90, 0.5)).toBeCloseTo(45);
    });

    test('wraps around 360 via shortest path (350 → 10)', () => {
        expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
    });

    test('wraps around 360 via shortest path (10 → 350)', () => {
        expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0);
    });

    test('handles identical angles', () => {
        expect(lerpAngle(90, 90, 0.5)).toBeCloseTo(90);
    });

    test('handles 180 degree difference (ambiguous, goes via 270)', () => {
        const result = lerpAngle(0, 180, 0.5);
        expect(result).toBeCloseTo(270);
    });

    test('normalizes result to [0, 360)', () => {
        const result = lerpAngle(350, 10, 1);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(360);
    });

    test('clamps t below 0', () => {
        expect(lerpAngle(0, 90, -1)).toBeCloseTo(0);
    });

    test('clamps t above 1', () => {
        expect(lerpAngle(0, 90, 2)).toBeCloseTo(90);
    });
});

// ============================================================================
// PlayerInterpolator Class (Spring-Damper)
// ============================================================================

describe('PlayerInterpolator', () => {
    let interpolator: PlayerInterpolator;

    beforeEach(() => {
        interpolator = new PlayerInterpolator();
    });

    test('returns undefined before any samples', () => {
        expect(interpolator.getDisplayPosition(1000)).toBeUndefined();
    });

    test('returns exact position after first sample', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        const pos = interpolator.getDisplayPosition(0);
        expect(pos).toEqual({ x: 100, y: 64, z: 200, yaw: undefined });
    });

    test('transitions to tracking phase after second sample', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, timestamp: 1000 });
        expect(interpolator.phase).toBe('tracking');
    });

    test('spring pulls display toward moving target', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, timestamp: 1000 });

        // Simulate a frame 100ms after second sample
        const pos = interpolator.getDisplayPosition(1100);
        expect(pos).toBeDefined();
        // Display should move toward ~104 + velocity*100ms
        expect(pos!.x).toBeGreaterThan(100);
    });

    test('converges to target over multiple frames', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, timestamp: 1000 });

        // Simulate 60 frames at 60fps
        let pos;
        for (let index = 1; index <= 60; index++) {
            pos = interpolator.getDisplayPosition(1000 + index * 16);
        }

        expect(pos).toBeDefined();
        // After ~1s of spring pull, should be near the extrapolated target
        // Target at t=1960ms: 104 + 0.004*(960) = 107.84
        expect(pos.x).toBeGreaterThan(104);
    });

    test('no position jumps between consecutive frames', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 270, timestamp: 1000 });

        // Get positions at two consecutive frames
        const pos1 = interpolator.getDisplayPosition(1100);
        const pos2 = interpolator.getDisplayPosition(1116);

        expect(pos1).toBeDefined();
        expect(pos2).toBeDefined();

        // The positions should be very close — no visible jump
        const dx = Math.abs(pos2!.x - pos1!.x);
        const dz = Math.abs(pos2!.z - pos1!.z);
        expect(dx).toBeLessThan(1);
        expect(dz).toBeLessThan(1);
    });

    test('handles new sample arriving smoothly (no phase transition jump)', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 270, timestamp: 1000 });

        // Get position just before third sample
        const posBefore = interpolator.getDisplayPosition(1999);

        // Third sample arrives
        interpolator.pushSample({ x: 108, y: 64, z: 200, yaw: 270, timestamp: 2000 });

        // Get position just after
        const posAfter = interpolator.getDisplayPosition(2001);

        expect(posBefore).toBeDefined();
        expect(posAfter).toBeDefined();

        // Should be very close — spring state carries over, no jump
        const dx = Math.abs(posAfter!.x - posBefore!.x);
        expect(dx).toBeLessThan(1);
    });

    test('stationary player stays at last position', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 1000 });

        // Zero velocity → target doesn't move → spring settles at 100
        // Simulate several frames
        let pos;
        for (let index = 1; index <= 30; index++) {
            pos = interpolator.getDisplayPosition(1000 + index * 16);
        }
        expect(pos).toBeDefined();
        expect(pos.x).toBeCloseTo(100, 0);
        expect(pos.z).toBeCloseTo(200, 0);
    });

    test('rejects teleport velocity and snaps when distance exceeds threshold', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        // Teleport: 1000 blocks in 1 second
        interpolator.pushSample({ x: 1100, y: 64, z: 200, timestamp: 1000 });

        // Display should snap near 1100 (teleport snap)
        const pos = interpolator.getDisplayPosition(1016);
        expect(pos).toBeDefined();
        expect(pos!.x).toBeCloseTo(1100, 0);
    });

    test('reset clears all state', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, timestamp: 1000 });
        interpolator.reset();

        expect(interpolator.getDisplayPosition(1500)).toBeUndefined();
        expect(interpolator.phase).toBe('idle');
        expect(interpolator.lastConfirmedPosition).toBeUndefined();
        expect(interpolator.yaw).toBeUndefined();
    });

    test('lastConfirmedPosition returns authoritative position', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, yaw: 90, timestamp: 500 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 270, timestamp: 1500 });

        const confirmed = interpolator.lastConfirmedPosition;
        expect(confirmed).toBeDefined();
        expect(confirmed!.x).toBe(104);
        expect(confirmed!.z).toBe(200);
        expect(confirmed!.yaw).toBe(270);
    });

    test('velocity is estimated from samples', () => {
        interpolator.pushSample({ x: 0, y: 64, z: 0, timestamp: 0 });
        interpolator.pushSample({ x: 4, y: 64, z: 0, timestamp: 1000 });

        expect(interpolator.velocity.vx).toBeCloseTo(0.004);
        expect(interpolator.velocity.vz).toBeCloseTo(0);
    });

    test('handles three sequential samples with direction change', () => {
        // Moving east, then turns north
        interpolator.pushSample({ x: 0, y: 64, z: 0, timestamp: 0 });
        interpolator.pushSample({ x: 4, y: 64, z: 0, yaw: 270, timestamp: 1000 });

        // Pump frames to let spring catch up
        for (let index = 1; index <= 60; index++) {
            interpolator.getDisplayPosition(1000 + index * 16);
        }

        interpolator.pushSample({ x: 4, y: 64, z: -4, yaw: 180, timestamp: 2000 });

        // Velocity should now be northward (0, -4 blocks/sec)
        expect(interpolator.velocity.vx).toBeCloseTo(0);
        expect(interpolator.velocity.vz).toBeCloseTo(-0.004);

        // After more frames, display should track northward
        let pos;
        for (let index = 1; index <= 60; index++) {
            pos = interpolator.getDisplayPosition(2000 + index * 16);
        }
        expect(pos).toBeDefined();
        expect(pos.z).toBeLessThan(-4);
    });

    test('interpolates Y coordinate smoothly', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 128, z: 200, timestamp: 1000 });

        // Shortly after second sample, Y should start moving toward 128
        const pos = interpolator.getDisplayPosition(1100);
        expect(pos).toBeDefined();
        expect(pos!.y).toBeGreaterThanOrEqual(64);
        expect(pos!.y).toBeLessThanOrEqual(128);
    });

    test('interpolates yaw via shortest path', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, yaw: 350, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 10, timestamp: 1000 });

        // Shortly after: yaw should be interpolating 350 → 10 via 0
        const pos = interpolator.getDisplayPosition(1100);
        expect(pos).toBeDefined();
        expect(pos!.yaw).toBeDefined();
        // Should be near 0 (between 350 and 10 via shortest path)
        const yaw = pos!.yaw!;
        expect(yaw >= 350 || yaw <= 10).toBe(true);
    });

    test('Y converges to sample value after many frames', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 100, z: 200, yaw: 270, timestamp: 1000 });

        // Many frames later, Y should be near 100
        let pos;
        for (let index = 1; index <= 60; index++) {
            pos = interpolator.getDisplayPosition(1000 + index * 16);
        }
        expect(pos).toBeDefined();
        expect(pos.y).toBeCloseTo(100, 0);
    });

    test('freezes after MAX_TRACKING_MS without new sample', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 270, timestamp: 1000 });

        // Pump frames up to 3s
        for (let index = 1; index <= 180; index++) {
            interpolator.getDisplayPosition(1000 + index * 16);
        }

        // Way past MAX_TRACKING_MS — position should freeze
        const pos1 = interpolator.getDisplayPosition(5000);
        const pos2 = interpolator.getDisplayPosition(10_000);
        expect(pos1!.x).toBeCloseTo(pos2!.x, 1);
        expect(pos1!.z).toBeCloseTo(pos2!.z, 1);
    });
});

// ============================================================================
// Interpolator Registry
// ============================================================================

describe('Interpolator Registry', () => {
    beforeEach(() => {
        clearAllInterpolators();
    });

    test('getInterpolator creates new instance for unknown player', () => {
        const interp = getInterpolator('TestPlayer');
        expect(interp).toBeInstanceOf(PlayerInterpolator);
        expect(interp.phase).toBe('idle');
    });

    test('getInterpolator returns same instance for same player (case-insensitive)', () => {
        const a = getInterpolator('Steve');
        const b = getInterpolator('steve');
        const c = getInterpolator('STEVE');
        expect(a).toBe(b);
        expect(b).toBe(c);
    });

    test('removeInterpolator removes and resets', () => {
        const interp = getInterpolator('Alex');
        interp.pushSample({ x: 1, y: 64, z: 2, timestamp: 0 });
        removeInterpolator('Alex');

        // Getting again should create a fresh one
        const fresh = getInterpolator('Alex');
        expect(fresh).not.toBe(interp);
        expect(fresh.lastConfirmedPosition).toBeUndefined();
    });

    test('removeInterpolator is no-op for unknown player', () => {
        removeInterpolator('NonExistent');
        expect(getAllInterpolators().size).toBe(0);
    });

    test('clearAllInterpolators removes all', () => {
        getInterpolator('Player1');
        getInterpolator('Player2');
        getInterpolator('Player3');
        expect(getAllInterpolators().size).toBe(3);

        clearAllInterpolators();
        expect(getAllInterpolators().size).toBe(0);
    });

    test('getAllInterpolators returns readonly map', () => {
        getInterpolator('A');
        getInterpolator('B');
        const all = getAllInterpolators();
        expect(all.size).toBe(2);
        expect(all.has('a')).toBe(true);
        expect(all.has('b')).toBe(true);
    });
});
