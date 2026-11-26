/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Overrides the players endpoint, see `npm run dev:players` */
    readonly VITE_PLAYERS_URL?: string;
}
