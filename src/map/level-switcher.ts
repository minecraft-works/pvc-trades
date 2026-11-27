/**
 * Level switching for a map that shows one tile pyramid level at a time.
 *
 * When the zoom crosses into another level, the last fully loaded level stays
 * visible underneath as a backdrop until the new level's tiles have loaded
 * (or failed), so the map never flashes empty. The shown level is always
 * drawn on top of the backdrop. An optional underlay level (the coarsest one,
 * a few tiles for the whole view) stays visible below everything, so a big
 * zoom-out shows blurry terrain rather than nothing while sharper tiles load.
 *
 * @module map/level-switcher
 */

/** The bits of a Leaflet pane the switcher touches */
export interface LevelPane {
    readonly style: { display: string; zIndex: string };
}

/** Options for {@link createLevelSwitcher} */
export interface LevelSwitcherOptions {
    /** Level that is always visible underneath (usually 0, the coarsest) */
    readonly underlayLevel?: number;
    /** Drop the backdrop after this long even if tiles are still loading (default 4 s) */
    readonly backdropTimeoutMs?: number;
}

/** Public API */
export interface LevelSwitcher {
    /** Show a level; the previous loaded level stays underneath for now */
    show: (level: number) => void;
    /** A tile of `level` was added and is loading */
    tileStarted: (level: number, key: string) => void;
    /** A tile of `level` loaded or failed */
    tileSettled: (level: number, key: string) => void;
    /** Call after requesting the shown level's tiles: drops the backdrop if nothing is loading */
    requestsDone: () => void;
    /** Stop the backdrop timer */
    dispose: () => void;
}

/** z-index of the shown level: above every backdrop level, below Leaflet's overlay pane (400) with the shop dots */
const SHOWN_Z_INDEX = 360;
/** Base z-index of hidden or backdrop levels (plus the level number) */
const BASE_Z_INDEX = 350;

/**
 * Create a level switcher for a map.
 * @param getPane - Pane holding the tiles of a level
 * @param levelCount - Number of pyramid levels (0 … levelCount − 1)
 * @param options - Underlay level and backdrop timeout
 * @returns Level switcher
 */
export function createLevelSwitcher(
    getPane: (level: number) => LevelPane | undefined,
    levelCount: number,
    options: LevelSwitcherOptions = {}
): LevelSwitcher {
    const { underlayLevel, backdropTimeoutMs = 4000 } = options;
    let shown: number | undefined;
    let backdrop: number | undefined;
    /** Last level whose tiles all finished loading */
    let loaded: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loading = new Map<number, Set<string>>();

    function apply(): void {
        const visible = new Set([shown, backdrop, underlayLevel]);
        for (let level = 0; level < levelCount; level++) {
            const pane = getPane(level);
            if (!pane) { continue; }
            pane.style.display = visible.has(level) ? '' : 'none';
            pane.style.zIndex = String(level === shown ? SHOWN_Z_INDEX : BASE_Z_INDEX + level);
        }
    }

    function finish(): void {
        clearTimeout(timer);
        timer = undefined;
        loaded = shown;
        if (backdrop === undefined) { return; }
        backdrop = undefined;
        apply();
    }

    function checkLoaded(): void {
        if (shown !== undefined && (loading.get(shown)?.size ?? 0) === 0) { finish(); }
    }

    return {
        show(level) {
            if (level === shown) { return; }
            backdrop = loaded === undefined || loaded === level ? undefined : loaded;
            shown = level;
            apply();
            clearTimeout(timer);
            timer = backdrop === undefined ? undefined : setTimeout(finish, backdropTimeoutMs);
        },
        tileStarted(level, key) {
            const keys = loading.get(level) ?? new Set<string>();
            keys.add(key);
            loading.set(level, keys);
        },
        tileSettled(level, key) {
            loading.get(level)?.delete(key);
            if (level === shown) { checkLoaded(); }
        },
        requestsDone: checkLoaded,
        dispose() {
            clearTimeout(timer);
            timer = undefined;
        },
    };
}
