/**
 * Configuration Store
 * 
 * Manages application configuration loaded from config.json.
 * Falls back to defaults on load failure.
 * 
 * @module stores/config-store
 */

import { BlueMapTileProvider, DynmapTileProvider, setActiveTileProvider } from '../map/providers/index.js';
import { type AppConfig, AppConfigSchema, DEFAULT_CONFIG, type TileSource } from '../types.js';

// ============================================================================
// Config Store
// ============================================================================

/**
 * Centralized store for application configuration.
 * 
 * Loads from config.json, validates with Zod, falls back to defaults.
 * 
 * @example
 * ```typescript
 * await configStore.load();
 * const baseUrl = configStore.get().dynmap.baseUrl;
 * ```
 */
class ConfigStore {
    private config: AppConfig = DEFAULT_CONFIG;
    private loaded = false;

    get(): AppConfig {
        return this.config;
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    async load(): Promise<AppConfig> {
        try {
            const response = await fetch('config.json');
            if (!response.ok) {
                console.warn('Failed to load config, using defaults');
                initTileProviderFromConfig(this.config);
                return this.config;
            }
            const data: unknown = await response.json();
            const parsed = AppConfigSchema.safeParse(data);
            if (parsed.success) {
                this.config = parsed.data;
                
                // Use local data.json when running on localhost
                if (globalThis.location.hostname === 'localhost') {
                    this.config = {
                        ...this.config,
                        dataUrl: `${globalThis.location.origin}${globalThis.location.pathname}data.json`
                    };
                    console.info('Running on localhost - using local data.json');
                }
            } else {
                console.warn('Invalid config format, using defaults:', parsed.error);
            }
            this.loaded = true;
            initTileProviderFromConfig(this.config);
            return this.config;
        } catch (error) {
            console.warn('Error loading config, using defaults:', error);
            this.loaded = true;
            initTileProviderFromConfig(this.config);
            return this.config;
        }
    }

    // For testing purposes
    _setConfig(config: AppConfig): void {
        this.config = config;
        this.loaded = true;
    }
}

export const configStore = new ConfigStore();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the current application configuration.
 * Returns default config if not yet loaded.
 * 
 * @returns The current AppConfig object
 * 
 * @example
 * const config = getConfig();
 * console.log(config.dynmap.baseUrl);
 */
export function getConfig(): AppConfig {
    return configStore.get();
}

/**
 * Load application configuration from config.json.
 * Falls back to default config on error.
 * 
 * @returns Promise resolving to the loaded AppConfig
 * 
 * @example
 * await loadConfig();
 * const config = getConfig();
 */
export async function loadConfig(): Promise<AppConfig> {
    return configStore.load();
}

// ============================================================================
// Tile Provider Initialization
// ============================================================================

/**
 * Create a tile provider matching the given config.
 *
 * @param config - The application config to read tile source from
 * @returns A TileProvider instance matching the configured source
 */
export function createTileProviderFromConfig(config: AppConfig): DynmapTileProvider | BlueMapTileProvider {
    const source: TileSource = config.tileSource;
    switch (source) {
        case 'dynmap': {
            return new DynmapTileProvider(config.dynmap.baseUrl);
        }
        case 'bluemap': {
            const bluemap = config.bluemap;
            if (!bluemap) {
                console.warn('tileSource is "bluemap" but no bluemap config provided, falling back to dynmap');
                return new DynmapTileProvider(config.dynmap.baseUrl);
            }
            return new BlueMapTileProvider(bluemap.baseUrl, bluemap.mapId);
        }
    }
}

/**
 * Initialize the active tile provider based on the loaded configuration.
 *
 * Called automatically after config is loaded. Creates the appropriate
 * provider and sets it as the active provider for the application.
 *
 * @param config - The loaded application config
 */
function initTileProviderFromConfig(config: AppConfig): void {
    const provider = createTileProviderFromConfig(config);
    setActiveTileProvider(provider);
    console.info(`Tile provider initialized: ${provider.name}`);
}
