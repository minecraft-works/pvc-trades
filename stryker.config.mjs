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
        'src/stores/cart-store.ts',
        'src/stores/navigation-store.ts',
        'src/stores/snapshot-store.ts',
        'src/stores/favorites-store.ts',
        'src/tile-coords.ts',
        'src/stores/player-interpolator.ts'
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
