/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    packageManager: 'npm',
    reporters: ['html', 'clear-text', 'progress'],
    htmlReporter: {
        fileName: 'reports/mutation/index.html'
    },
    testRunner: 'vitest',
    checkers: ['typescript'],
    tsconfigFile: 'tsconfig.json',
    vitest: {
        configFile: 'vitest.config.js'
    },
    mutate: [
        'src/library.ts',
        'src/tile-coords.ts',
        'src/valuation/*.ts',
        'src/routing/*.ts',
        'src/interpolation/interpolation.ts',
        'src/dashboard/dashboard-data.ts',
        'src/search/deviation.ts',
        'src/search/query.ts',
        'src/search/shop-filter.ts',
        'src/stores/cart-store.ts',
        'src/stores/navigation-store.ts',
        'src/stores/snapshot-store.ts',
        'src/stores/favorites-store.ts',
        'src/stores/player-interpolator.ts',
        '!src/**/*.test.ts'
    ],
    // Mutation score thresholds
    thresholds: {
        high: 85,
        low: 70,
        break: 65
    },
    // Performance settings
    concurrency: 4,
    timeoutMS: 10000,
    // Incremental mode for faster re-runs
    incremental: true,
    incrementalFile: '.stryker-tmp/incremental.json'
};
