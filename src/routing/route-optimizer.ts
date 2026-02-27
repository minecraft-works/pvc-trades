/**
 * Route Optimization (Travelling Salesman Problem)
 *
 * Implements nearest-neighbor heuristic with 2-opt improvement
 * for optimizing shop visit order.
 *
 * @module routing/route-optimizer
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A point with coordinates and world (for nether conversion)
 */
export interface RoutePoint {
    readonly x: number;
    readonly z: number;
    readonly world: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Convert coordinates to overworld-equivalent for distance calculation.
 * Nether coordinates are multiplied by 8 (1 nether block = 8 overworld blocks).
 *
 * @param x - X coordinate
 * @param z - Z coordinate
 * @param world - World name
 * @returns Overworld-equivalent coordinates
 *
 * @example
 * toOverworldEquivalent(100, 50, 'the_nether')  // { x: 800, z: 400 }
 * toOverworldEquivalent(100, 50, 'overworld')   // { x: 100, z: 50 }
 */
export function toOverworldEquivalent(x: number, z: number, world: string): { readonly x: number; readonly z: number } {
    if (world.toLowerCase().includes('nether')) {
        return { x: x * 8, z: z * 8 };
    }
    return { x, z };
}

/**
 * Convert coordinates for display on the specified view world.
 * When viewing overworld: nether coords are scaled ×8
 * When viewing nether: overworld coords are scaled ÷8
 *
 * @param x - Original X coordinate
 * @param z - Original Z coordinate
 * @param stopWorld - The world where this point is located
 * @param viewWorld - The world currently being viewed ('overworld' or 'the_nether')
 * @returns Coordinates adjusted for the view world
 *
 * @example
 * // Viewing overworld: nether stop at (100, 50) displays at (800, 400)
 * toViewCoords(100, 50, 'the_nether', 'overworld')  // { x: 800, z: 400 }
 *
 * // Viewing nether: overworld stop at (800, 400) displays at (100, 50)
 * toViewCoords(800, 400, 'overworld', 'the_nether')  // { x: 100, z: 50 }
 *
 * // Same world: no conversion needed
 * toViewCoords(100, 50, 'overworld', 'overworld')  // { x: 100, z: 50 }
 */
export function toViewCoords(
    x: number,
    z: number,
    stopWorld: string,
    viewWorld: string
): { readonly x: number; readonly z: number } {
    const isStopNether = stopWorld.toLowerCase().includes('nether');
    const isViewNether = viewWorld.toLowerCase().includes('nether');

    if (isStopNether === isViewNether) {
        // Same world type: no conversion needed
        return { x, z };
    }

    if (isStopNether && !isViewNether) {
        // Nether stop, viewing overworld: scale up ×8
        return { x: x * 8, z: z * 8 };
    }

    // Overworld stop, viewing nether: scale down ÷8
    return { x: x / 8, z: z / 8 };
}

/**
 * Calculate distance between two points in overworld-equivalent coordinates.
 * Automatically converts nether coordinates for accurate cross-world distances.
 *
 * @param x1 - First point X
 * @param z1 - First point Z
 * @param world1 - First point world
 * @param x2 - Second point X
 * @param z2 - Second point Z
 * @param world2 - Second point world
 * @returns Distance in overworld blocks
 *
 * @example
 * // Same-world distance
 * calculateRouteDistance(0, 0, 'overworld', 100, 100, 'overworld') // ~141.4
 *
 * // Cross-world: nether point at (100, 100) = overworld (800, 800)
 * calculateRouteDistance(0, 0, 'overworld', 100, 100, 'the_nether') // ~1131.4
 */
// eslint-disable-next-line max-params
export function calculateRouteDistance(
    x1: number, z1: number, world1: string,
    x2: number, z2: number, world2: string
): number {
    const p1 = toOverworldEquivalent(x1, z1, world1);
    const p2 = toOverworldEquivalent(x2, z2, world2);
    return Math.hypot(p1.x - p2.x, p1.z - p2.z);
}

/**
 * Build distance matrix for route optimization.
 * Index 0 is the origin; indices 1-n are the points.
 *
 * @param points - Array of route points to visit
 * @param origin - Starting position (defaults to 0,0 in overworld)
 * @returns 2D matrix where matrix[i][j] = distance from i to j
 *
 * @example
 * const matrix = buildDistanceMatrix(shops, playerPosition);
 * // matrix[0][1] = distance from player to first shop
 * // matrix[1][2] = distance from first shop to second shop
 */
export function buildDistanceMatrix(points: readonly RoutePoint[], origin?: RoutePoint): number[][] {
    const n = points.length + 1; // +1 for origin
    const matrix: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

    const originX = origin?.x ?? 0;
    const originZ = origin?.z ?? 0;
    const originWorld = origin?.world ?? 'overworld';

    // Origin is at index 0
    for (const [index, point_] of points.entries()) {
        const point = point_;
        const distributionFromOrigin = calculateRouteDistance(originX, originZ, originWorld, point.x, point.z, point.world);
        matrix[0]![index + 1] = distributionFromOrigin;
        matrix[index + 1]![0] = distributionFromOrigin;
    }

    // Distances between points
    for (let index = 0; index < points.length; index++) {
        for (let index_ = index + 1; index_ < points.length; index_++) {
            const a = points[index]!;
            const b = points[index_]!;
            const distribution = calculateRouteDistance(a.x, a.z, a.world, b.x, b.z, b.world);
            matrix[index + 1]![index_ + 1] = distribution;
            matrix[index_ + 1]![index + 1] = distribution;
        }
    }

    return matrix;
}

/**
 * Generate initial route using nearest-neighbor heuristic.
 * Starts from origin and greedily visits the closest unvisited point.
 *
 * @param points - Points to visit
 * @param distributionMatrix - Pre-computed distance matrix
 * @returns Array of indices into points array in visit order
 *
 * @example
 * const order = nearestNeighborOrder(shops, distMatrix);
 * // order = [2, 0, 1] means visit shops[2], then shops[0], then shops[1]
 */
export function nearestNeighborOrder(points: readonly RoutePoint[], distributionMatrix: number[][]): number[] {
    if (points.length === 0) {return [];}
    if (points.length === 1) {return [0];}

    const order: number[] = [];
    const visited = new Set<number>();
    let current = 0; // Start at origin (index 0 in matrix)

    while (order.length < points.length) {
        let nearestIndex = -1;
        let nearestDistribution = Infinity;

        for (let index = 0; index < points.length; index++) {
            if (visited.has(index)) {continue;}
            const distribution = distributionMatrix[current]![index + 1]!; // +1 because origin is at 0
            if (distribution < nearestDistribution) {
                nearestDistribution = distribution;
                nearestIndex = index;
            }
        }

        if (nearestIndex !== -1) {
            order.push(nearestIndex);
            visited.add(nearestIndex);
            current = nearestIndex + 1; // +1 for matrix index
        }
    }

    return order;
}

/**
 * Calculate total route length for a given visit order.
 *
 * @param order - Array of point indices in visit order
 * @param distributionMatrix - Pre-computed distance matrix
 * @returns Total distance in overworld blocks
 *
 * @example
 * const totalDist = calculateOrderDistance([0, 2, 1], distMatrix);
 */
export function calculateOrderDistance(order: number[], distributionMatrix: number[][]): number {
    if (order.length === 0) {return 0;}

    let total = distributionMatrix[0]![order[0]! + 1]!; // Origin to first

    for (let index = 0; index < order.length - 1; index++) {
        total += distributionMatrix[order[index]! + 1]![order[index + 1]! + 1]!;
    }

    return total;
}

/**
 * Optimize route using 2-opt edge swapping.
 *
 * Algorithm:
 * 1. For each pair of non-adjacent edges
 * 2. Try reversing the segment between them
 * 3. Keep the swap if it reduces total distance
 * 4. Repeat until no improvement found
 *
 * Time complexity: O(n²) per iteration, typically 2-5 iterations.
 *
 * @param order - Initial route order
 * @param distributionMatrix - Pre-computed distance matrix
 * @returns Optimized route order (new array)
 *
 * @example
 * const optimized = twoOptOptimize(nearestNeighborOrder(points, matrix), matrix);
 */
export function twoOptOptimize(order: number[], distributionMatrix: number[][]): number[] {
    if (order.length < 3) {return [...order];}

    const result = [...order];

    while (applyTwoOptPass(result, distributionMatrix)) {
        // Keep improving until no swaps found in a pass
    }

    return result;
}

/**
 * Perform a single pass of 2-opt improvement over all edge pairs.
 * Returns true if any swap was made.
 */
function applyTwoOptPass(result: number[], distributionMatrix: number[][]): boolean {
    let improved = false;

    for (let startIndex = 0; startIndex < result.length - 1; startIndex++) {
        for (let endIndex = startIndex + 2; endIndex < result.length; endIndex++) {
            const indices = calculateEdgeIndices(result, startIndex, endIndex);

            if (shouldSwapEdges(distributionMatrix, indices)) {
                applyTwoOptSwap(result, startIndex, endIndex);
                improved = true;
            }
        }
    }

    return improved;
}

/**
 * Compute optimized route order using nearest-neighbor + 2-opt.
 * Solves an approximate Traveling Salesman Problem (TSP).
 *
 * @param points - Array of route points to visit
 * @param origin - Optional starting position (defaults to 0,0 in overworld)
 * @returns Indices into points array in optimal visit order
 *
 * @example
 * const cartItems = getCartItems();
 * const order = computeOptimalOrder(cartItems, playerPosition);
 * const optimizedRoute = order.map(i => cartItems[i]);
 */
export function computeOptimalOrder(points: readonly RoutePoint[], origin?: RoutePoint): number[] {
    if (points.length === 0) {return [];}
    if (points.length === 1) {return [0];}

    // Build distance matrix
    const distributionMatrix = buildDistanceMatrix(points, origin);

    // Get initial order using nearest-neighbor
    let order = nearestNeighborOrder(points, distributionMatrix);

    // Optimize with 2-opt
    order = twoOptOptimize(order, distributionMatrix);

    return order;
}

// ============================================================================
// Private Helpers
// ============================================================================

interface TwoOptEdgeIndices {
    readonly previousI: number;
    readonly currentI: number;
    readonly currentJ: number;
    readonly nextJ: number;
}

function calculateEdgeIndices(
    result: number[],
    startIndex: number,
    endIndex: number
): TwoOptEdgeIndices {
    return {
        previousI: startIndex === 0 ? 0 : result[startIndex - 1]! + 1,
        currentI: result[startIndex]! + 1,
        currentJ: result[endIndex]! + 1,
        nextJ: endIndex === result.length - 1 ? -1 : result[endIndex + 1]! + 1
    };
}

function shouldSwapEdges(
    distributionMatrix: number[][],
    indices: TwoOptEdgeIndices
): boolean {
    const { previousI, currentI, currentJ, nextJ } = indices;

    // Current cost: prevI→currI + currJ→nextJ
    let currentCost = distributionMatrix[previousI]![currentI]!;
    if (nextJ !== -1) {
        currentCost += distributionMatrix[currentJ]![nextJ]!;
    }

    // New cost: prevI→currJ + currI→nextJ
    let newCost = distributionMatrix[previousI]![currentJ]!;
    if (nextJ !== -1) {
        newCost += distributionMatrix[currentI]![nextJ]!;
    }

    return newCost < currentCost - 0.001;
}

function applyTwoOptSwap(result: number[], startIndex: number, endIndex: number): void {
    const segment = result.slice(startIndex, endIndex + 1).toReversed();
    result.splice(startIndex, endIndex - startIndex + 1, ...segment);
}
