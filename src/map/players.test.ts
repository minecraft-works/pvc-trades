/**
 * Unit tests for player management utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPlayerWorld, getPlayerWorldForFilter, fetchPlayers, filterPlayersByWorld } from './players.js';
import type { Player } from '../types.js';

// Mock the dependencies
vi.mock('../library.js', () => ({
    getWorldId: (world: string) => {
        // Simplified mock: normalize common world names
        if (world.includes('nether')) {return 'the_nether';}
        if (world.includes('end')) {return 'the_end';}
        return 'overworld';
    }
}));

describe('getPlayerWorld', () => {
    it('returns normalized world ID when player has world field', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 100, y: 64, z: 200 },
            world: 'world_nether'
        };
        expect(getPlayerWorld(player)).toBe('the_nether');
    });

    it('returns overworld for player without world field and foreign=false', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 100, y: 64, z: 200 },
            foreign: false
        };
        expect(getPlayerWorld(player)).toBe('overworld');
    });

    it('returns nether for player without world field and foreign=true', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 100, y: 64, z: 200 },
            foreign: true
        };
        expect(getPlayerWorld(player)).toBe('the_nether');
    });

    it('returns overworld for player without world field and undefined foreign', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 100, y: 64, z: 200 }
        };
        expect(getPlayerWorld(player)).toBe('overworld');
    });

    it('prefers world field over foreign flag', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 100, y: 64, z: 200 },
            world: 'world_the_end',
            foreign: true // This should be ignored
        };
        expect(getPlayerWorld(player)).toBe('the_end');
    });
});

describe('getPlayerWorldForFilter', () => {
    it('uses getWorldId when player has world field', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 0, y: 0, z: 0 },
            world: 'world_nether'
        };
        expect(getPlayerWorldForFilter(player)).toBe('the_nether');
    });

    it('defaults to overworld when player has no world field', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 0, y: 0, z: 0 }
        };
        expect(getPlayerWorldForFilter(player)).toBe('overworld');
    });
});

describe('filterPlayersByWorld', () => {
    const players: Player[] = [
        { name: 'Player1', position: { x: 0, y: 0, z: 0 }, world: 'world' },
        { name: 'Player2', position: { x: 0, y: 0, z: 0 }, world: 'world_nether' },
        { name: 'Player3', position: { x: 0, y: 0, z: 0 } }, // No world = overworld
        { name: 'Player4', position: { x: 0, y: 0, z: 0 }, world: 'world_the_end' }
    ];

    it('filters players in overworld', () => {
        const result = filterPlayersByWorld(players, 'overworld');
        expect(result).toHaveLength(2);
        expect(result.map(p => p.name)).toEqual(['Player1', 'Player3']);
    });

    it('filters players in nether', () => {
        const result = filterPlayersByWorld(players, 'the_nether');
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('Player2');
    });

    it('filters players in end', () => {
        const result = filterPlayersByWorld(players, 'the_end');
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('Player4');
    });

    it('returns empty array for world with no players', () => {
        const result = filterPlayersByWorld(players, 'unknown_world');
        expect(result).toHaveLength(0);
    });

    it('returns empty array for empty players list', () => {
        const result = filterPlayersByWorld([], 'overworld');
        expect(result).toHaveLength(0);
    });
});

describe('fetchPlayers', () => {
    const mockPlayers: Player[] = [
        { name: 'Alice', position: { x: 100, y: 64, z: 200 } },
        { name: 'Bob', position: { x: -50, y: 70, z: 150 } }
    ];

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns players on successful fetch', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ players: mockPlayers })
        } as Response);

        const result = await fetchPlayers();
        expect(result).toEqual(mockPlayers);
    });

    it('returns empty array when response is not ok', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false
        } as Response);

        const result = await fetchPlayers();
        expect(result).toEqual([]);
    });

    it('returns empty array when fetch throws', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await fetchPlayers();
        expect(result).toEqual([]);
    });

    it('returns empty array when players field is missing', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({})
        } as Response);

        const result = await fetchPlayers();
        expect(result).toEqual([]);
    });

    it('calls correct API endpoint', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ players: [] })
        } as Response);

        await fetchPlayers();

        expect(fetch).toHaveBeenCalledWith(
            'https://pvc-players.minecraft-works.workers.dev',
            expect.anything()
        );
    });
});
