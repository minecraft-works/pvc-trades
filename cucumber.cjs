module.exports = {
    default: {
        import: ['features/step-definitions/**/*.ts', 'features/support/**/*.ts'],
        // paths removed - specify feature files via command line
        format: ['progress-bar', 'html:test-results/cucumber-report.html'],
        formatOptions: { snippetInterface: 'async-await' },
        publishQuiet: true
    }
};
