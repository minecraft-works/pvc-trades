/**
 * Unit tests for player management utilities.
 */

import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

import type { Player } from '../types.js';
import { fetchPlayers, filterPlayersByWorld,getPlayerWorld } from './players.js';

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

describe('getPlayerWorld (filter cases)', () => {
    it('uses getWorldId when player has world field', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 0, y: 0, z: 0 },
            foreign: false,
            uuid: 'test-uuid',
            world: 'world_nether'
        };
        expect(getPlayerWorld(player)).toBe('the_nether');
    });

    it('returns overworld when player has no world field and foreign is false', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 0, y: 0, z: 0 },
            foreign: false,
            uuid: 'test-uuid'
        };
        expect(getPlayerWorld(player)).toBe('overworld');
    });

    it('returns nether when player has no world field and foreign is true', () => {
        const player: Player = {
            name: 'TestPlayer',
            position: { x: 0, y: 0, z: 0 },
            foreign: true,
            uuid: 'test-uuid'
        };
        expect(getPlayerWorld(player)).toBe('the_nether');
    });
});

describe('filterPlayersByWorld', () => {
    const players: Player[] = [
        { name: 'Player1', position: { x: 0, y: 0, z: 0 }, foreign: false, uuid: 'u1', world: 'world' },
        { name: 'Player2', position: { x: 0, y: 0, z: 0 }, foreign: true, uuid: 'u2' }, // No world, foreign=true → nether
        { name: 'Player3', position: { x: 0, y: 0, z: 0 }, foreign: false, uuid: 'u3' }, // No world, foreign=false → overworld
        { name: 'Player4', position: { x: 0, y: 0, z: 0 }, foreign: false, uuid: 'u4', world: 'world_the_end' }
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
        { uuid: 'a1', name: 'Alice', foreign: false, position: { x: 100, y: 64, z: 200 } },
        { uuid: 'b2', name: 'Bob', foreign: false, position: { x: -50, y: 70, z: 150 } }
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
