import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createLevelSwitcher, type LevelPane } from './level-switcher.js';

function makePanes(count: number): LevelPane[] {
    return Array.from({ length: count }, () => ({ style: { display: '', zIndex: '' } }));
}

function visibleLevels(panes: readonly LevelPane[]): number[] {
    return panes.flatMap((pane, level) => (pane.style.display === 'none' ? [] : [level]));
}

describe('createLevelSwitcher', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    test('keeps the loaded level underneath until the new level has loaded', () => {
        const panes = makePanes(5);
        const levels = createLevelSwitcher(level => panes[level], 5);
        levels.show(4);
        levels.tileStarted(4, 'a');
        levels.requestsDone();
        levels.tileSettled(4, 'a');
        expect(visibleLevels(panes)).toEqual([4]);

        // Zoom out: level 3 loads on top of level 4
        levels.show(3);
        levels.tileStarted(3, 'b');
        levels.requestsDone();
        expect(visibleLevels(panes)).toEqual([3, 4]);
        expect(Number(panes[3]?.style.zIndex)).toBeGreaterThan(Number(panes[4]?.style.zIndex));

        levels.tileSettled(3, 'b');
        expect(visibleLevels(panes)).toEqual([3]);
    });

    test('drops the backdrop at once when the new level needs no new tiles', () => {
        const panes = makePanes(5);
        const levels = createLevelSwitcher(level => panes[level], 5);
        levels.show(4);
        levels.requestsDone();
        levels.show(3);
        levels.requestsDone();
        expect(visibleLevels(panes)).toEqual([3]);
    });

    test('gives up on the backdrop after the timeout if a tile never settles', () => {
        const panes = makePanes(5);
        const levels = createLevelSwitcher(level => panes[level], 5, { backdropTimeoutMs: 1000 });
        levels.show(4);
        levels.requestsDone();
        levels.show(2);
        levels.tileStarted(2, 'stuck');
        levels.requestsDone();
        vi.advanceTimersByTime(999);
        expect(visibleLevels(panes)).toEqual([2, 4]);
        vi.advanceTimersByTime(1);
        expect(visibleLevels(panes)).toEqual([2]);
    });

    test('zooming through several levels keeps the last fully loaded one underneath', () => {
        const panes = makePanes(5);
        const levels = createLevelSwitcher(level => panes[level], 5);
        levels.show(4);
        levels.requestsDone();
        levels.show(3);
        levels.tileStarted(3, 'half');
        levels.requestsDone();
        levels.show(2);
        levels.tileStarted(2, 'x');
        levels.requestsDone();
        expect(visibleLevels(panes)).toEqual([2, 4]);
    });

    test('the underlay level stays visible beneath whatever level is shown', () => {
        const panes = makePanes(5);
        const levels = createLevelSwitcher(level => panes[level], 5, { underlayLevel: 0 });
        levels.show(4);
        levels.requestsDone();
        expect(visibleLevels(panes)).toEqual([0, 4]);
        expect(Number(panes[0]?.style.zIndex)).toBeLessThan(Number(panes[4]?.style.zIndex));
    });
});
