module.exports = {
    default: {
        import: ['features/step-definitions/**/*.ts', 'features/support/**/*.ts'],
        paths: ['features/**/*.feature'],
        format: ['progress-bar', 'html:test-results/cucumber-report.html'],
        formatOptions: { snippetInterface: 'async-await' },
        publishQuiet: true
    }
};
