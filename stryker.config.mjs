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
        'src/library.ts'
    ],
    // Mutation score thresholds
    thresholds: {
        high: 80,
        low: 60,
        break: 50
    },
    // Performance settings
    concurrency: 4,
    timeoutMS: 10000,
    // Incremental mode for faster re-runs
    incremental: true,
    incrementalFile: '.stryker-tmp/incremental.json'
};
