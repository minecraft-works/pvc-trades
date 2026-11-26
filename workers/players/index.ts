/**
 * players — Cloudflare Worker
 *
 * Proxies the live player list of the map server and reshapes it into the
 * format the app validates with `PlayersDataSchema` (src/types.ts).
 * The map server sends no CORS headers, so browsers cannot read it directly.
 *
 * Configure the upstream in wrangler.toml (`PLAYERS_UPSTREAM_URL`).
 * Deploy: `cd workers/players && npx wrangler deploy`
 */

export interface Env {
    /** URL of the map server's player list, e.g. `https://example.com/maps/tiles/players.json` */
    PLAYERS_UPSTREAM_URL: string;
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
};

/**
 * How long one upstream response is reused. Every navigating client polls
 * frequently, so without this each poll would hit the map server.
 */
const UPSTREAM_CACHE_MS = 1000;

interface UpstreamPlayer {
    uuid: string;
    name: string;
    world: string;
    x: number;
    y: number;
    z: number;
    yaw?: number;
}

type AppPlayer = ReturnType<typeof toAppPlayer>;

let cached: { players: AppPlayer[]; fetchedAt: number } | undefined;
let inFlight: Promise<AppPlayer[]> | undefined;

function isUpstreamPlayer(value: unknown): value is UpstreamPlayer {
    if (typeof value !== 'object' || value === null) { return false; }
    const p: Partial<Record<keyof UpstreamPlayer, unknown>> = value;
    return typeof p.uuid === 'string'
        && typeof p.name === 'string'
        && typeof p.world === 'string'
        && typeof p.x === 'number'
        && typeof p.y === 'number'
        && typeof p.z === 'number'
        && (p.yaw === undefined || typeof p.yaw === 'number');
}

function toAppPlayer(player: UpstreamPlayer) {
    return {
        uuid: player.uuid,
        name: player.name,
        world: player.world,
        // The app treats the nether as the "foreign" world
        foreign: player.world.toLowerCase().includes('nether'),
        position: { x: player.x, y: player.y, z: player.z },
        rotation: { pitch: 0, yaw: player.yaw ?? 0, roll: 0 },
    };
}

function json(body: unknown, status = 200): Response {
    return Response.json(body, { status, headers: CORS_HEADERS });
}

async function fetchUpstreamPlayers(url: string): Promise<AppPlayer[]> {
    const upstream = await fetch(url);
    if (!upstream.ok) {
        throw new Error(`Upstream returned ${String(upstream.status)}`);
    }
    const data: unknown = await upstream.json();
    const list: unknown = typeof data === 'object' && data !== null && 'players' in data ? data.players : undefined;
    if (!Array.isArray(list)) {
        throw new TypeError('Upstream returned an unexpected format');
    }
    return list.filter((p): p is UpstreamPlayer => isUpstreamPlayer(p)).map(p => toAppPlayer(p));
}

/**
 * Get players, reusing a fresh cached response and sharing concurrent upstream requests.
 * @param url - Upstream player list URL
 * @returns Players in the app's format
 */
async function getPlayers(url: string): Promise<AppPlayer[]> {
    const now = Date.now();
    if (cached && now - cached.fetchedAt < UPSTREAM_CACHE_MS) {
        return cached.players;
    }
    inFlight ??= fetchUpstreamPlayers(url)
        .then((players) => {
            cached = { players, fetchedAt: Date.now() };
            return players;
        })
        .finally(() => { inFlight = undefined; });
    return inFlight;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(undefined, { status: 204, headers: CORS_HEADERS });
        }

        try {
            return json({ players: await getPlayers(env.PLAYERS_UPSTREAM_URL) });
        } catch (error) {
            return json({ error: error instanceof Error ? error.message : 'Upstream request failed' }, 502);
        }
    },
};
