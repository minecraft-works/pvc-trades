# ADR-011: Player Position Interpolation (Predictive Lerp)

## Status
**Implemented** - 2026

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
| **Predictive Lerp (Hybrid)** | Zero latency + smooth corrections | Slightly more complex than pure lerp | **Selected** |

## Decision

Implement **Predictive Lerp (Hybrid)** — dead reckoning extrapolation with smooth lerp correction when new data arrives.

### How It Works

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
 ┌────────────┐    200ms    ┌────────────┐    extrapolate
 │ Extrapolate├────────────►│  Correct   ├──────────────►
 │ (predict)  │  correction │ (lerp from │  with new velocity
 └────────────┘   phase     │  old→new)  │
                            └────────────┘
```

**Phases:**
1. **Idle** — Fewer than 2 samples; return raw position
2. **Correcting** (200ms) — New poll arrived; lerp from predicted-wrong position to true position
3. **Extrapolating** — Dead reckon from last known position using estimated velocity

### Safeguards

- **Teleport rejection**: Speeds >12 blocks/sec (sprint=5.6, horse=10.6) zero the velocity
- **Speed-only gating**: Extrapolation requires speed ≥ 0.001 blocks/ms. Yaw is intentionally *not* checked against velocity — players routinely strafe, look around while walking, or ride vehicles, causing yaw to diverge from movement direction. The correction mechanism handles prediction errors gracefully.
- **Max extrapolation**: Capped at 3000ms to prevent runaway prediction
- **Per-player state**: Each player gets an independent `PlayerInterpolator` instance via a shared registry

## Architecture

```
library.ts (pure math)
├── estimateVelocity(previous, current, dtMs)
├── extrapolatePosition(base, velocity, elapsedMs)
├── lerpPosition(from, to, t)
├── lerpAngle(from, to, t) — shortest-path angular interpolation
└── shouldExtrapolate(velocity, _yaw, threshold) — speed-only check

stores/player-interpolator.ts (stateful, per-player)
├── PlayerInterpolator class
│   ├── pushSample(sample) — { x, y, z, yaw?, timestamp }
│   ├── getDisplayPosition(now) → InterpolatedPosition | undefined
│   │   Returns { x, y, z, yaw? } with:
│   │   - X/Z: correction lerp + velocity extrapolation
│   │   - Y: lerped during correction, held during extrapolation
│   │   - Yaw: shortest-path lerped during correction, held during extrapolation
│   └── reset()
└── Registry functions
    ├── getInterpolator(name) — lazy-creates
    ├── removeInterpolator(name)
    ├── clearAllInterpolators()
    └── getAllInterpolators()

main.ts (navigation context)
├── handleFoundPlayer → pushSample + authoritative logic
├── startNavAnimationLoop → rAF reads interpolated position + yaw
│   Updates marker position via setLatLng AND arrow rotation via CSS transform
└── stopNavigation → cleanup interpolator

map/shop-map-dialog.ts (shop map context)
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
- Zero perceived latency — markers lead the position slightly via extrapolation
- Works for all players on the shop map, not just the navigating player
- Minimal CPU: one rAF loop per context, `setLatLng` is a single CSS transform
- No new dependencies — reuses existing Leaflet, debug libraries
- Teleport/portal detection prevents visual glitches

### Negative
- Brief ~200ms mismatch when players change direction abruptly (corrected quickly)
- Slightly overshoots when a moving player stops (corrected on next poll)
- Additional ~300 lines of code to maintain
- Second rAF loop (shop map) runs independently — acceptable since it only runs while dialog is open

### Neutral
- Max extrapolation (3s) means markers freeze if polling stops — same as current behavior
- Registry is global but lightweight; interpolators for offline players are removed naturally

## Testing

- **55 unit tests** in `src/interpolation.test.ts` covering all math functions and PlayerInterpolator phases
- Teleport rejection, portal crossing reset, Y interpolation, yaw shortest-path interpolation all covered
- `lerpAngle` tested for wrapping, clamping, normalization, and 180° ambiguity
- Integration tested via existing BDD scenarios (markers still render correctly)

## References

- Dead reckoning: Standard game networking technique (Gaffer On Games)
- Minecraft movement speeds: Sprint=5.6 b/s, Horse=10.6 b/s, Elytra=variable
- Nether coordinate ratio: ADR-008
