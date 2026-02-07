# ADR-004: Route Optimization Algorithm

## Status
**Implemented** - 2024

## Context

When players build a shopping cart with items from multiple shops, they need to visit each shop location. The order in which they visit shops significantly affects total travel distance. This is a variant of the Traveling Salesman Problem (TSP).

### Requirements

- Compute a "good enough" visiting order for typical cart sizes (2-20 shops)
- Support dynamic start position (player's current location)
- Handle cross-world travel (overworld ↔ nether)
- Run fast enough for real-time recalculation as player moves

## Decision

Use **Nearest-Neighbor heuristic** followed by **2-opt local optimization**.

### Algorithm

1. **Nearest-Neighbor**: Starting from player position, greedily visit the closest unvisited shop. Repeat until all shops visited.
2. **2-opt**: Iteratively swap pairs of edges if the swap reduces total distance. Continue until no improvement found.

```
Player → Shop A → Shop B → Shop C → Shop D
         └──────2-opt swaps──────┘
```

## Rationale

### Why Not Exact TSP?

| Approach | Complexity | 10 shops | 20 shops |
|----------|------------|----------|----------|
| Brute force | O(n!) | 3.6M ops | 2.4×10¹⁸ ops |
| Dynamic programming | O(n²·2ⁿ) | 102K ops | 419M ops |
| Nearest-neighbor + 2-opt | O(n²) | 100 ops | 400 ops |

Exact solutions are computationally infeasible for real-time use. The heuristic approach finds solutions within ~5-10% of optimal for typical shop counts.

### Why Nearest-Neighbor?

- Simple to implement and understand
- Naturally handles dynamic start position
- Produces reasonable initial solution (typically within 25% of optimal)

### Why 2-opt?

- Simple local search that catches obvious inefficiencies
- Eliminates "crossing" paths that nearest-neighbor sometimes creates
- Converges quickly for small n
- Combined with nearest-neighbor, typically achieves within 5% of optimal

### Alternatives Considered

| Algorithm | Pros | Cons | Decision |
|-----------|------|------|----------|
| Christofides | Guaranteed 1.5× optimal | Requires MST + matching, complex | Rejected: complexity |
| Simulated Annealing | Can escape local minima | Needs tuning, non-deterministic | Rejected: unpredictable |
| Genetic Algorithm | Good for large n | Overkill for <50 shops | Rejected: complexity |
| Or-Tools / Concorde | Optimal solutions | External dependency, slow | Rejected: dependency |

## Implementation

- `nearestNeighborOrder()` in `library.ts` — initial tour construction
- `twoOptOptimize()` in `library.ts` — local optimization
- `computeOptimalOrder()` — orchestrates both phases
- `buildDistanceMatrix()` — precomputes pairwise distances

## Consequences

### Positive

- Fast enough for real-time recalculation (<10ms for 20 shops)
- No external dependencies
- Predictable, deterministic results
- Easy to understand and debug

### Negative

- Not guaranteed optimal (acceptable trade-off)
- May produce suboptimal routes for unusual shop distributions
- 2-opt is O(n²) per iteration, limits scalability beyond ~100 shops

## Future Considerations

If cart sizes grow significantly (>50 shops), consider:
- Lin-Kernighan heuristic (better quality)
- Early termination in 2-opt (faster)
- Caching distance matrices between recalculations
