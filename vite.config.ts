import { readFileSync } from 'node:fs';

import { defineConfig, type Plugin } from 'vite';

import playersWorker from './workers/players/index.ts';

const BASE = '/pvc-trades/';

/** Player list URL of the map server configured in config.json */
function playersUpstreamUrl(): string {
    const config = JSON.parse(readFileSync('config.json', 'utf8')) as { squaremap: { baseUrl: string } };
    return `${config.squaremap.baseUrl}/tiles/players.json`;
}

/**
 * Serves the players Worker code from the dev server (`/api/players`), so
 * live players work locally without deploying the Worker. Use via `npm run dev:players`.
 */
function localPlayersWorker(): Plugin {
    return {
        name: 'local-players-worker',
        configureServer(server) {
            server.middlewares.use(`${BASE}api/players`, (_request, response) => {
                void playersWorker.fetch(new Request('http://localhost/'), { PLAYERS_UPSTREAM_URL: playersUpstreamUrl() }).then(async (workerResponse) => {
                    response.statusCode = workerResponse.status;
                    workerResponse.headers.forEach((value, key) => response.setHeader(key, value));
                    response.end(await workerResponse.text());
                });
            });
        }
    };
}

export default defineConfig({
    base: BASE,
    plugins: [localPlayersWorker()]
});