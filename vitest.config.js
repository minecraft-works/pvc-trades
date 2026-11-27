import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'workers/**/*.test.ts'],
        exclude: ['tests/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/test-fixtures.ts',
                'src/**/index.ts',
                'src/types.ts',
                'src/main.ts',
                'src/debug.ts',
                'src/constants.ts',
                'src/cart/**/*.ts',
                'src/dashboard/dashboard-ui.ts',
                'src/data-loader/**/*.ts',
                // DOM/Leaflet code is covered by the browser tests; pure modules in these folders stay in
                'src/map/{index,leaflet,outside-gestures,player-layer,shop-map-dialog,tile-loader,tile-types}.ts',
                'src/search/search-sort.ts',
                'src/dialogs/**/*.ts',
                'src/favorites/**/*.ts',
                'src/navigation/**/*.ts',
                'src/rendering/**/*.ts',
                'src/quick-search/**/*.ts',
                'src/test-globals.d.ts',
                'src/chatlog/run-parser.ts'
            ],
            thresholds: {
                statements: 86,
                branches: 79,
                functions: 87,
                lines: 86
            }
        }
    }
});
