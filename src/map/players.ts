/**
 * Player position fetching and world detection utilities.
 * @module map/players
 */

import { getWorldId } from '../library.js';
import { WORLDS } from '../constants.js';
import type { Player, PlayersData } from '../types.js';

/** API endpoint for player positions */
const PLAYERS_API_URL = 'https://pvc-players.minecraft-works.workers.dev';

/** Timeout for player fetch requests in milliseconds */
const FETCH_TIMEOUT_MS = 3000;

/**
 * Determine which world a player is in.
 * Uses the `world` field if available, otherwise falls back to `foreign` flag.
 * `foreign: true` means the player is in the nether (different server in linked network).
 * 
 * @param player - The player object from the API
 * @returns Normalized world ID ('overworld' | 'the_nether' | 'the_end')
 */
export function getPlayerWorld(player: Player): string {
    if (player.world) {
        return getWorldId(player.world);
    }
    // Fallback: foreign=true means nether, false means overworld
    return player.foreign ? WORLDS.NETHER : WORLDS.OVERWORLD;
}

/**
 * Get the world ID for filtering players that match a given world.
 * Handles the case where player.world might be undefined.
 * 
 * @param player - The player object
 * @returns Normalized world ID, defaults to overworld if not specified
 */
export function getPlayerWorldForFilter(player: Player): string {
    return player.world ? getWorldId(player.world) : WORLDS.OVERWORLD;
}

/**
 * Fetch player positions from API.
 * Returns empty array if fetch fails (graceful degradation - no dots shown).
 * 
 * @returns Promise resolving to array of Player objects
 */
export async function fetchPlayers(): Promise<Player[]> {
    try {
        const response = await fetch(PLAYERS_API_URL, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        if (response.ok) {
            const data = (await response.json()) as PlayersData;
            return data.players ?? [];
        }
    } catch (error) {
        console.warn('Failed to fetch players:', error);
    }
    // Return empty on failure - no dots shown
    return [];
}

/**
 * Filter players to those in a specific world.
 * 
 * @param players - Array of all players
 * @param worldId - Target world ID to filter for
 * @returns Players that are in the specified world
 */
export function filterPlayersByWorld(players: Player[], worldId: string): Player[] {
    return players.filter(p => getPlayerWorldForFilter(p) === worldId);
}
