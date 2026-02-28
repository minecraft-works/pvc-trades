/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        // Pure library must not import DOM modules
        {
            name: 'library-no-dom',
            comment: 'library.ts must not import DOM/UI modules (pure functions only)',
            severity: 'error',
            from: { path: '^src/library\\.ts$' },
            to: {
                path: '^src/(main\\.ts|dialogs|favorites|rendering|cart|navigation|dashboard|map)/',
                pathNot: '(map-math|dashboard-data)\\.ts$'
            }
        },
        // Stores must not import dialog/UI modules
        {
            name: 'stores-no-ui',
            comment: 'Store modules must not import UI/dialog modules',
            severity: 'error',
            from: { path: '^src/stores/' },
            to: { path: '^src/(dialogs|favorites|rendering|cart)/' }
        },
        // No importing from main.ts (it's the entry point)
        {
            name: 'no-import-main',
            comment: 'No module should import from main.ts (it is the entry point)',
            severity: 'error',
            from: { pathNot: '^src/main\\.ts$' },
            to: { path: '^src/main\\.ts$' }
        },
        // No circular dependencies
        {
            name: 'no-circular',
            comment: 'Circular dependencies create coupling and must be eliminated',
            severity: 'error',
            from: {},
            to: { circular: true }
        },
        // No importing test files from production code
        {
            name: 'no-test-imports',
            comment: 'Production code must not import test files',
            severity: 'error',
            from: { pathNot: '\\.(test|spec)\\.ts$' },
            to: { path: '\\.(test|spec)\\.ts$' }
        },
        // No importing node_modules not in package.json
        {
            name: 'no-orphan-deps',
            comment: 'Do not import packages not listed in package.json',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: ['npm-no-pkg', 'npm-unknown']
            }
        }
    ],
    options: {
        doNotFollow: {
            path: 'node_modules'
        },
        tsPreCompilationDeps: true,
        tsConfig: {
            fileName: './tsconfig.json'
        },
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default']
        },
        reporterOptions: {
            text: {
                highlightFocused: true
            }
        }
    }
};
