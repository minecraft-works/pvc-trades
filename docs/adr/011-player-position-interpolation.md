# ADR-011: Player Position Interpolation (Spring-Damper Attraction)

## Status
**Implemented** - 2026 (revised from Predictive Lerp to Spring-Damper)

## Context

The application polls the Dynmap API for player positions at 1000ms intervals (navigation) and 5000ms intervals (shop map dialog). Between polls, player markers remain static, causing visible "jumps" when new positions arrive — especially jarring during live navigation where the map follows the player.

### Constraints

1. **Cannot increase poll frequency** — the Dynmap server is a community resource not under our control; 1000ms is already aggressive
2. **No measurement noise** — Dynmap reports exact server positions, unlike GPS/sensor data
3. **Cross-dimension teleports** — players entering Nether portals appear to "jump" hundreds of blocks (Nether 1:8 ratio)
4. **Variable player behavior** — players walk, sprint, ride horses, stand still, change direction unpredictably
5. **Multiple simultaneous players** — shop map shows all online players, not just the navigating one
6. **Performance** — 60fps animation loop must be lightweight; no icon DOM rebuilds per frame

## Options Considered

| Technique | Pros | Cons | Verdict |
|-----------|------|------|---------|
| **Linear Lerp** | Simple, smooth | Always 1 poll behind (1s latency) | Rejected: too laggy |
| **Dead Reckoning** | Zero latency, predictive | Drifts when direction changes | Rejected: too jerky on corrections |
| **Kalman Filter** | Optimal for noisy sensors | Overkill — no measurement noise to filter | Rejected: unnecessary complexity |
| **Cubic Hermite Spline** | Very smooth curves | Needs 4+ samples, complex, still 1s behind | Rejected: complexity without benefit |
| **Predictive Lerp (Hybrid)** | Zero latency + smooth corrections | Discrete phase transitions create seams | Superseded |
| **Spring-Damper Attraction** | Continuous, phase-free, natural motion | Slightly more complex math | **Selected** |

## Decision

Implement **Spring-Damper Attraction** — a continuous force model inspired by Karamouzas et al. (2009) where the display marker is attracted toward a moving target using spring dynamics.

### How It Works

The display position is governed by a spring-damper equation:

$$F = k \cdot (target - display) - c \cdot v_{display}$$

where:
- $k$ = spring stiffness (25 s⁻²) — controls convergence speed
- $c$ = damping coefficient (8.5 s⁻¹) — prevents oscillation (ζ ≈ 0.85)
- $target$ = last server position + velocity × elapsed (a **moving target**)

```
Poll N arrives (t=0)        Poll N+1 arrives (t=1000ms)
    │                             │
    ▼                             ▼
 ┌──────────┐                ┌──────────┐
 │ Estimate │                │ Estimate │
 │ velocity │                │ velocity │
 └────┬─────┘                └────┬─────┘
      │                           │
      ▼                           ▼
 ┌──────────────┐            ┌──────────────┐
 │ Update target├───────────►│ Update target│
 │ (sample+vel) │  spring    │ (sample+vel) │  spring continues
 └──────────────┘  pulls     └──────────────┘  seamlessly
                   display                      toward new target
                   continuously
```

**Key difference from Predictive Lerp**: No discrete phase transitions. The spring force is always > 0 unless the marker is at the target with zero velocity (Karamouzas §4.3: "||p_α(x) - x|| > 0 unless x has reached the goal"). When a new sample arrives, the target simply updates — the spring state carries over with no seams or jumps.

**Phases:**
1. **Idle** — Fewer than 2 samples; return raw position
2. **Tracking** — Spring continuously pulls display toward moving target

### Safeguards

- **Teleport snapping**: If new sample is >50 blocks from display, snap instantly (no spring for portals)
- **Velocity rejection**: Speeds >12 blocks/sec (sprint=5.6, horse=10.6) zero the velocity (same as before)
- **Max tracking**: Spring freezes after 3000ms without new sample (prevents runaway)
- **Dt clamping**: Individual spring steps clamped to 100ms to prevent instability from frame drops
- **Per-player state**: Each player gets an independent `PlayerInterpolator` instance via a shared registry
- **Semi-implicit Euler**: Symplectic integrator (velocity-first) preserves energy better than explicit Euler

## Architecture

```
interpolation/interpolation.ts (pure math)
├── estimateVelocity(previous, current, dtMs) — unchanged
├── springStep(displayPos, targetPos, displayVel, k, damping, dtMs) → { position, velocity }
├── lerpAngle(from, to, t) — shortest-path angular interpolation (unchanged)
├── SPRING_STIFFNESS = 25  (k, 1/s²)
└── SPRING_DAMPING = 8.5   (c, 1/s, ζ ≈ 0.85)

stores/player-interpolator.ts (stateful, per-player)
├── PlayerInterpolator class
│   ├── pushSample(sample) — updates target, estimates velocity
│   ├── getDisplayPosition(now) → InterpolatedPosition | undefined
│   │   Runs spring step per frame:
│   │   - XZ: spring-damper pull toward moving target
│   │   - Y: exponential approach (~200ms to 95%)
│   │   - Yaw: shortest-path lerped over 200ms
│   └── reset()
└── Registry functions (unchanged)
    ├── getInterpolator(name)
    ├── removeInterpolator(name)
    ├── clearAllInterpolators()
    └── getAllInterpolators()

main.ts (navigation context) — unchanged
├── handleFoundPlayer → pushSample + authoritative logic
├── startNavAnimationLoop → rAF reads interpolated position + yaw
└── stopNavigation → cleanup interpolator

map/shop-map-dialog.ts (shop map context) — unchanged
├── fetchPlayersAndUpdateCache → pushSample for each player
├── startShopMapAnimLoop → rAF updates all on-screen markers
└── stopShopMapAnimLoop → cleanup on dialog close
```

### Rendering Separation

Two distinct update paths prevent expensive DOM operations at 60fps:

- **On poll** (1000ms/5000ms): `updatePlayerMarker()` — rebuilds icon HTML (nether class), updates authoritative distance/auto-advance calculations
- **On rAF** (~16ms): `marker.setLatLng()` + arrow rotation via CSS `transform: rotate()` — moves and rotates the existing marker without DOM reconstruction

## Consequences

### Positive
- Player markers glide smoothly between polls instead of jumping
- **No phase transition seams** — eliminates the correction→extrapolation jump of Predictive Lerp
- Zero perceived latency — markers lead the position via spring attraction to moving target
- **Direction changes handled naturally** — spring automatically adjusts, no discrete correction needed
- Works for all players on the shop map, not just the navigating player
- Minimal CPU: one rAF loop per context, `setLatLng` is a single CSS transform
- No new dependencies — reuses existing Leaflet, debug libraries
- Teleport/portal detection prevents visual glitches

### Negative
- Slight visual lag when player changes direction abruptly (spring needs ~400ms to converge)
- Slightly overshoots when a moving player stops suddenly (~1-2% with ζ=0.85)
- Semi-implicit Euler is less accurate than RK4, but adequate for visual interpolation
- Additional ~250 lines of code to maintain (reduced from ~300 with Predictive Lerp)

### Neutral
- Max tracking (3s) means markers freeze if polling stops — same as previous behavior
- Registry is global but lightweight; interpolators for offline players are removed naturally
- Spring constants (k=25, c=8.5) may benefit from tuning once deployed

## Testing

- **Unit tests** in `src/interpolation.test.ts` covering:
  - `springStep`: convergence, damping, dt clamping, stiffness scaling, axis proportionality
  - `estimateVelocity`: same as before (teleport rejection, speed validation)
  - `lerpAngle`: same as before (wrapping, clamping, normalization)
  - `PlayerInterpolator`: tracking convergence, seamless sample transitions, teleport snap, Y/yaw interpolation, freeze on timeout, reset, direction changes
  - Registry: same as before (create, remove, clear, case-insensitive)
- Integration tested via existing BDD scenarios (markers still render correctly)

## References

- Karamouzas, I., Geraerts, R., & Overmars, M. (2009). "Indicative routes for path planning and crowd simulation." *Computer Graphics Forum*, 28(8), 2085–2095. § 4.3: Attraction point model with force always > 0 unless at goal.
- Dead reckoning: Standard game networking technique (Gaffer On Games)
- Minecraft movement speeds: Sprint=5.6 b/s, Horse=10.6 b/s, Elytra=variable
- Nether coordinate ratio: ADR-008
