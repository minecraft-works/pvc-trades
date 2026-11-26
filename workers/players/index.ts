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

interface UpstreamPlayer {
    uuid: string;
    name: string;
    world: string;
    x: number;
    y: number;
    z: number;
    yaw?: number;
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
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(undefined, { status: 204, headers: CORS_HEADERS });
        }

        const upstream = await fetch(env.PLAYERS_UPSTREAM_URL);
        if (!upstream.ok) {
            return json({ error: `Upstream returned ${String(upstream.status)}` }, 502);
        }

        const data = (await upstream.json()) as { players?: UpstreamPlayer[] };
        return json({ players: (data.players ?? []).map(toAppPlayer) });
    },
};
