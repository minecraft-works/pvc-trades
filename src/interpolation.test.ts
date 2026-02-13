/**
 * Unit tests for player position interpolation (Predictive Lerp).
 * 
 * Tests the pure math functions in library.ts and the PlayerInterpolator class.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
    estimateVelocity,
    extrapolatePosition,
    lerpPosition,
    lerpAngle,
    shouldExtrapolate,
} from './library.js';
import { PlayerInterpolator, getInterpolator, removeInterpolator, clearAllInterpolators, getAllInterpolators } from './stores/player-interpolator.js';

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

describe('extrapolatePosition', () => {
    test('extrapolates forward using velocity', () => {
        const pos = extrapolatePosition({ x: 100, z: 200 }, { vx: 0.004, vz: 0 }, 500);
        expect(pos.x).toBeCloseTo(102);
        expect(pos.z).toBeCloseTo(200);
    });

    test('extrapolates diagonally', () => {
        const pos = extrapolatePosition({ x: 0, z: 0 }, { vx: 0.003, vz: 0.004 }, 1000);
        expect(pos.x).toBeCloseTo(3);
        expect(pos.z).toBeCloseTo(4);
    });

    test('zero elapsed returns base position', () => {
        const pos = extrapolatePosition({ x: 50, z: 60 }, { vx: 0.01, vz: 0.01 }, 0);
        expect(pos.x).toBe(50);
        expect(pos.z).toBe(60);
    });

    test('zero velocity returns base position', () => {
        const pos = extrapolatePosition({ x: 50, z: 60 }, { vx: 0, vz: 0 }, 1000);
        expect(pos.x).toBe(50);
        expect(pos.z).toBe(60);
    });
});

describe('lerpPosition', () => {
    test('t=0 returns from position', () => {
        const pos = lerpPosition({ x: 0, z: 0 }, { x: 10, z: 20 }, 0);
        expect(pos.x).toBe(0);
        expect(pos.z).toBe(0);
    });

    test('t=1 returns to position', () => {
        const pos = lerpPosition({ x: 0, z: 0 }, { x: 10, z: 20 }, 1);
        expect(pos.x).toBe(10);
        expect(pos.z).toBe(20);
    });

    test('t=0.5 returns midpoint', () => {
        const pos = lerpPosition({ x: 0, z: 0 }, { x: 10, z: 20 }, 0.5);
        expect(pos.x).toBe(5);
        expect(pos.z).toBe(10);
    });

    test('clamps t below 0', () => {
        const pos = lerpPosition({ x: 0, z: 0 }, { x: 10, z: 20 }, -1);
        expect(pos.x).toBe(0);
        expect(pos.z).toBe(0);
    });

    test('clamps t above 1', () => {
        const pos = lerpPosition({ x: 0, z: 0 }, { x: 10, z: 20 }, 2);
        expect(pos.x).toBe(10);
        expect(pos.z).toBe(20);
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

describe('shouldExtrapolate', () => {
    test('returns false for zero velocity', () => {
        expect(shouldExtrapolate({ vx: 0, vz: 0 }, 90)).toBe(false);
    });

    test('returns false for very low speed', () => {
        expect(shouldExtrapolate({ vx: 0.0001, vz: 0 }, 270)).toBe(false);
    });

    test('returns true when velocity matches heading (east)', () => {
        // Moving east (+x), yaw=270 (east in Minecraft)
        expect(shouldExtrapolate({ vx: 0.004, vz: 0 }, 270)).toBe(true);
    });

    test('returns true when velocity matches heading (south)', () => {
        // Moving south (+z), yaw=0 (south in Minecraft)
        expect(shouldExtrapolate({ vx: 0, vz: 0.004 }, 0)).toBe(true);
    });

    test('returns true even when velocity opposes heading', () => {
        // Moving east (+x), but facing west (yaw=90) — still extrapolate
        // Yaw is intentionally ignored; correction handles wrong predictions
        expect(shouldExtrapolate({ vx: 0.004, vz: 0 }, 90)).toBe(true);
    });

    test('returns true when no yaw is available', () => {
        // No yaw data — trust velocity alone
        expect(shouldExtrapolate({ vx: 0.004, vz: 0 })).toBe(true);
    });

    test('respects custom speed threshold', () => {
        expect(shouldExtrapolate({ vx: 0.002, vz: 0 }, undefined, 0.003)).toBe(false);
        expect(shouldExtrapolate({ vx: 0.004, vz: 0 }, undefined, 0.003)).toBe(true);
    });
});

// ============================================================================
// PlayerInterpolator Class
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

    test('starts correction phase after second sample', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, timestamp: 1000 });
        expect(interpolator.phase).toBe('correcting');
    });

    test('correction lerps toward true position', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, timestamp: 1000 });

        // At t=1000 (start of correction), display is somewhere
        // Half through correction (100ms into 200ms correction window)
        const pos = interpolator.getDisplayPosition(1100);
        expect(pos).toBeDefined();
        // Position should be between old predicted and new true position
        expect(pos!.x).toBeGreaterThanOrEqual(100);
        expect(pos!.x).toBeLessThanOrEqual(110);
    });

    test('transitions to extrapolation after correction completes', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, timestamp: 1000 });

        // Well past correction duration (200ms)
        interpolator.getDisplayPosition(1300);
        expect(interpolator.phase).toBe('extrapolating');
    });

    test('correction→extrapolation transition is seamless (no position jump)', () => {
        // Player moving east at 4 blocks/sec
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 270, timestamp: 1000 });

        // Get position 1ms before correction ends and 1ms after
        const justBefore = interpolator.getDisplayPosition(1199);
        const justAfter = interpolator.getDisplayPosition(1201);

        expect(justBefore).toBeDefined();
        expect(justAfter).toBeDefined();

        // The positions should be very close (< 0.1 block) — no visible jump
        const dx = Math.abs(justAfter!.x - justBefore!.x);
        const dz = Math.abs(justAfter!.z - justBefore!.z);
        expect(dx).toBeLessThan(0.1);
        expect(dz).toBeLessThan(0.1);
    });

    test('correction target moves with velocity for fast players', () => {
        // Player moving east at 8 blocks/sec (sprinting)
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 108, y: 64, z: 200, yaw: 270, timestamp: 1000 });

        // At end of correction (t=1200), the position should account for
        // continued movement during the 200ms correction window
        const posAtCorrectionEnd = interpolator.getDisplayPosition(1200);
        expect(posAtCorrectionEnd).toBeDefined();

        // With moving target: 108 + 0.008 * 200 = 109.6 (accounts for movement)
        // Without moving target: would have ended at 108 then jumped to 109.6
        expect(posAtCorrectionEnd!.x).toBeGreaterThan(108);
    });

    test('extrapolation moves position forward using velocity', () => {
        // Two samples: player moving east at 4 blocks/sec
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 270, timestamp: 1000 });

        // Skip past correction, then extrapolate 500ms forward
        // After correction ends at ~1200ms, extrapolation from (104, 200) at 0.004 b/ms
        // At 1700ms: 700ms after last sample = 104 + 0.004 * 700 = 106.8
        const pos = interpolator.getDisplayPosition(1700);
        expect(pos).toBeDefined();
        expect(pos!.x).toBeGreaterThan(104);
        expect(pos!.z).toBeCloseTo(200);
    });

    test('freezes extrapolation at maximum duration', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 270, timestamp: 1000 });

        // Way into the future — should freeze at MAX_EXTRAPOLATION_MS (3000ms)
        const pos1 = interpolator.getDisplayPosition(5000);
        const pos2 = interpolator.getDisplayPosition(10_000);
        expect(pos1).toEqual(pos2);
    });

    test('stationary player stays at last position', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 1000 });

        // Zero velocity → no extrapolation, stays at 100, 200
        const pos = interpolator.getDisplayPosition(1500);
        expect(pos).toBeDefined();
        expect(pos!.x).toBeCloseTo(100);
        expect(pos!.z).toBeCloseTo(200);
    });

    test('rejects teleport velocity', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        // Teleport: 1000 blocks in 1 second
        interpolator.pushSample({ x: 1100, y: 64, z: 200, timestamp: 1000 });

        // After correction, should stay near 1100 (no extrapolation due to zero velocity)
        const pos = interpolator.getDisplayPosition(2000);
        expect(pos).toBeDefined();
        expect(pos!.x).toBeCloseTo(1100);
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
        interpolator.pushSample({ x: 4, y: 64, z: -4, yaw: 180, timestamp: 2000 });

        // Velocity should now be northward (0, -4 blocks/sec)
        expect(interpolator.velocity.vx).toBeCloseTo(0);
        expect(interpolator.velocity.vz).toBeCloseTo(-0.004);

        // Extrapolation should continue northward
        const pos = interpolator.getDisplayPosition(2700);
        expect(pos).toBeDefined();
        expect(pos!.z).toBeLessThan(-4);
    });

    test('interpolates Y coordinate during correction', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 128, z: 200, timestamp: 1000 });

        // Mid-correction
        const pos = interpolator.getDisplayPosition(1100);
        expect(pos).toBeDefined();
        expect(pos!.y).toBeGreaterThanOrEqual(64);
        expect(pos!.y).toBeLessThanOrEqual(128);
    });

    test('interpolates yaw via shortest path during correction', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, yaw: 350, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 64, z: 200, yaw: 10, timestamp: 1000 });

        // Mid-correction: yaw should go 350 → 0 → 10 (shortest path)
        const pos = interpolator.getDisplayPosition(1100);
        expect(pos).toBeDefined();
        expect(pos!.yaw).toBeDefined();
        // Should be near 0 (between 350 and 10 via shortest path)
        const yaw = pos!.yaw!;
        expect(yaw >= 350 || yaw <= 10).toBe(true);
    });

    test('returns Y from last sample during extrapolation', () => {
        interpolator.pushSample({ x: 100, y: 64, z: 200, timestamp: 0 });
        interpolator.pushSample({ x: 104, y: 100, z: 200, yaw: 270, timestamp: 1000 });

        // Past correction
        const pos = interpolator.getDisplayPosition(1500);
        expect(pos).toBeDefined();
        expect(pos!.y).toBe(100);
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
