import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import functional from 'eslint-plugin-functional';
import jsdoc from 'eslint-plugin-jsdoc';
import security from 'eslint-plugin-security';
import regexp from 'eslint-plugin-regexp';

export default tseslint.config(
    // Ignore generated and build files
    {
        ignores: [
            '.features-gen/**',
            '.stryker-tmp/**',
            'dist/**',
            'docs/api/**',
            'reports/**',
            'test-results/**',
            'playwright-report/**',
            'node_modules/**',
            '*.cjs',
            '*.config.js',
            '*.config.ts',
            '*.config.mjs',
            'eslint.config.js'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    unicorn.configs.recommended,
    sonarjs.configs.recommended,
    security.configs.recommended,
    regexp.configs['flat/recommended'],
    {
        plugins: {
            'unused-imports': unusedImports,
            'simple-import-sort': simpleImportSort,
            functional,
            jsdoc
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.test.ts', 'src/*.test.ts', 'src/stores/*.test.ts', 'src/map/*.test.ts', 'src/map/providers/*.test.ts', 'src/dialogs/*.test.ts', 'src/chatlog/*.test.ts', 'tests/*.spec.ts', 'tests/helpers/*.ts', 'features/*.ts', 'features/steps/*.ts', 'features/support/*.ts', 'features/step-definitions/*.ts', 'scripts/*.ts'],
                    defaultProject: './tsconfig.eslint.json',
                    maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50
                },
                tsconfigRootDir: import.meta.dirname
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                fetch: 'readonly',
                console: 'readonly',
                process: 'readonly',
                requestAnimationFrame: 'readonly',
                clearInterval: 'readonly',
                setInterval: 'readonly',
                globalThis: 'readonly'
            }
        },
        rules: {
            // Unused imports with autofix
            'unused-imports/no-unused-imports': 'error',
            'unused-imports/no-unused-vars': ['error', {
                vars: 'all',
                varsIgnorePattern: '^_',
                args: 'after-used',
                argsIgnorePattern: '^_'
            }],
            '@typescript-eslint/no-unused-vars': 'off', // Handled by unused-imports

            'no-console': 'off',
            'eqeqeq': 'error',
            'curly': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'no-multiple-empty-lines': ['error', { max: 1 }],
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { avoidEscape: true }],

            // Import sorting and deduplication
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',

            // Zero any in production (vibe-coding-quality guard rail)
            '@typescript-eslint/no-explicit-any': 'error',

            // Immutability (functional plugin) — core vibe-coding drift guard
            'functional/immutable-data': ['error', {
                ignoreImmediateMutation: true,
                ignoreAccessorPattern: ['**.dataset.**', '**.style.**', '**.classList.**', '**.textContent', '**.innerHTML', '**.scrollTop', '**.value']
            }],
            'functional/no-let': ['error', { allowInForLoopInit: true }],
            'functional/prefer-immutable-types': ['error', {
                enforcement: 'ReadonlyShallow',
                variables: {
                    // Zod schema consts, default config objects, caches, and debug loggers
                    // are module-level mutable by design (third-party Zod types, intentional caches)
                    ignoreNamePattern: ['[A-Z]\\w*Schema$', '^DEFAULT_\\w+$', '\\w*[Cc]ache$', '^debug[A-Z]', '^__nav'],
                    // Explicit module-level variables whose annotated type is a mutable builder
                    // (Map, Set, Record, or array). Covered for implicit-type variables below.
                    ignoreTypePattern: ['\\[\\]', '^Map<', '^Set<', '^Record<'],
                    // Local variables inside functions are builder accumulators (arrays, Maps, Sets)
                    // that cannot use readonly because they are mutated before being returned.
                    ignoreInFunctions: true,
                },
                parameters: {
                    // Skip parameters whose type is inferred (e.g. arrow-function callback args).
                    ignoreInferredTypes: true,
                    // Mutable Map parameters: item-values.ts helpers call .set() on them.
                    // number[] / number[][] are algorithm-internal in route-optimizer.ts.
                    ignoreTypePattern: ['^Map<', '^number\\[\\]$', '^number\\[\\]\\[\\]$'],
                },
                returnTypes: {
                    // Inferred return types (helpers, callbacks) don't need explicit readonly annotation.
                    ignoreInferredTypes: true,
                    // DOM element return types are inherently mutable — getElement returns live HTMLElement refs.
                    // Also covers generic type param T when T extends HTMLElement (interface property signatures).
                    ignoreNamePattern: ['^getElement$'],
                    ignoreTypePattern: ['^number\\[\\]$', '^number\\[\\]\\[\\]$', '^[A-Z]$'],
                },
            }],
            'functional/no-return-void': 'off',
            'functional/no-classes': 'off',
            'functional/no-mixed-types': 'off',
            'functional/no-promise-reject': 'off',
            'functional/no-throw-statements': 'off',
            'functional/prefer-property-signatures': 'error',
            'functional/prefer-tacit': 'error',

            // JSDoc enforcement — all exported functions must be documented
            'jsdoc/require-jsdoc': ['error', {
                publicOnly: true,
                require: { FunctionDeclaration: true, ArrowFunctionExpression: false, MethodDefinition: false }
            }],
            'jsdoc/require-description': ['error', { descriptionStyle: 'body' }],
            'jsdoc/require-returns': 'error',
            'jsdoc/require-param': 'warn',
            'jsdoc/require-param-description': 'error',
            'jsdoc/check-param-names': 'error',
            'jsdoc/check-types': 'error',
            'jsdoc/no-undefined-types': 'error',

            // Security — disable noisy rules with high false-positive rate
            'security/detect-object-injection': 'off',
            'security/detect-non-literal-regexp': 'off',
            'security/detect-non-literal-fs-filename': 'off',

            // Regex quality
            'regexp/no-misleading-capturing-group': 'error',
            'regexp/no-super-linear-backtracking': 'error',
            'regexp/prefer-named-capture-group': 'error',
            'regexp/no-empty-character-class': 'error',
            'regexp/no-useless-backreference': 'error',

            // Mutation guards — ban common AI drift patterns
            'no-restricted-syntax': ['error',
                {
                    selector: 'UnaryExpression[operator="delete"]',
                    message: 'Use object spread or Map.delete() instead of delete operator.'
                },
                {
                    selector: 'CallExpression[callee.property.name="sort"][arguments.length=0]',
                    message: 'Always pass an explicit comparator to .sort() — bare sort mutates and is locale-dependent.'
                },
                {
                    selector: 'CallExpression[callee.object.name="Object"][callee.property.name="assign"]',
                    message: 'Use object spread { ...a, ...b } instead of Object.assign().'
                }
            ],

            // Complexity rules - STRICT
            'complexity': ['error', { max: 12 }],
            'max-depth': ['error', { max: 4 }],
            'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
            'max-lines-per-function': ['error', { max: 75, skipBlankLines: true, skipComments: true }],
            'max-params': ['error', { max: 5 }],
            'max-nested-callbacks': ['error', { max: 3 }],

            // SonarJS - STRICT
            'sonarjs/cognitive-complexity': ['error', 15],
            'sonarjs/no-duplicate-string': ['error', { threshold: 4 }],
            'sonarjs/no-identical-functions': 'error',
            'sonarjs/no-collapsible-if': 'error',
            'sonarjs/no-nested-switch': 'error',
            'sonarjs/no-inconsistent-returns': 'error',
            'sonarjs/no-redundant-parentheses': 'error',
            'sonarjs/no-wildcard-import': 'error',
            'sonarjs/prefer-immediate-return': 'error',
            'sonarjs/prefer-object-literal': 'error',
            'sonarjs/nested-control-flow': 'error',
            'sonarjs/max-union-size': 'error',
            'sonarjs/shorthand-property-grouping': 'error',
            'sonarjs/too-many-break-or-continue-in-loop': 'error',
            'sonarjs/bool-param-default': 'error',

            // Unicorn - STRICT with minimal necessary adjustments
            'unicorn/filename-case': ['error', { cases: { kebabCase: true, camelCase: true } }],
            'unicorn/prevent-abbreviations': 'error',
            'unicorn/no-null': 'error',
            'unicorn/no-array-reduce': 'error',
            'unicorn/no-array-for-each': 'error',
            'unicorn/prefer-query-selector': 'error',
            'unicorn/prefer-module': 'error',
            'unicorn/prefer-top-level-await': 'error',
            'unicorn/consistent-function-scoping': 'error',
            'unicorn/no-array-callback-reference': 'error',
            'unicorn/prefer-global-this': 'error',

            // Type-checked rules — bumped to error for strictTypeChecked
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/restrict-template-expressions': ['error', {
                allowNumber: true,
                allowBoolean: true
            }],
            '@typescript-eslint/no-unnecessary-condition': 'error',
            // Downgraded: getElement<T> pattern uses T only in return position but provides caller convenience
            '@typescript-eslint/no-unnecessary-type-parameters': 'error',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/restrict-plus-operands': ['error', {
                allowNumberAndString: true
            }],
            '@typescript-eslint/no-misused-spread': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
            '@typescript-eslint/no-deprecated': 'error',
            // Readonly fields in classes (stores)
            '@typescript-eslint/prefer-readonly': 'error',
            // Force import type for type-only imports (tree-shaking + clarity)
            '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
            '@typescript-eslint/consistent-type-exports': 'error',
            // Ban unsafe type assertions — #1 AI escape hatch
            '@typescript-eslint/no-unsafe-type-assertion': 'error',

            // Prefer nullish coalescing over ||, optional chains over &&-guards
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error'
        }
    },
    // Stores intentionally mutate state (ADR-005: class-based store pattern)
    {
        files: ['src/stores/**/*.ts'],
        rules: {
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            'functional/prefer-property-signatures': 'off',
            '@typescript-eslint/prefer-readonly': 'off',
            'no-restricted-syntax': 'off'
        }
    },
    // UI/DOM modules legitimately mutate DOM elements and local state
    {
        files: [
            'src/main.ts',
            'src/cart/**/*.ts',
            'src/dialogs/**/*.ts',
            'src/favorites/**/*.ts',
            'src/map/**/*.ts',
            'src/navigation/**/*.ts',
            'src/rendering/**/*.ts',
            'src/dashboard/**/*.ts'
        ],
        rules: {
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            '@typescript-eslint/prefer-readonly': 'off'
        }
    },
    // Computation modules build data structures imperatively (Maps, arrays, Sets)
    // but are pure functions that return new values — not external mutation
    {
        files: [
            'src/library.ts',
            'src/routing/**/*.ts',
            'src/valuation/**/*.ts',
            'src/search/**/*.ts',
            'src/data-loader/**/*.ts',
            'src/chatlog/**/*.ts',
            'src/interpolation/**/*.ts',
            'src/tile-coords.ts',
            'src/tile-pyramid.ts'
        ],
        rules: {
            'functional/immutable-data': 'off',
            'functional/no-let': 'off'
        }
    },
    // Route optimizer uses non-null assertions for array-index access in tight loops
    // where bounds are guaranteed by algorithm invariants (ADR-004: nearest-neighbor + 2-opt)
    {
        files: ['src/routing/route-optimizer.ts'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'error'
        }
    },
    // Relaxed rules for spec tests - these are large legacy test files
    {
        files: ['tests/**/*.spec.ts'],
        rules: {
            // Type assertions are standard practice for partial test mocks
            '@typescript-eslint/no-unsafe-type-assertion': 'off',
            // Allow longer files and functions in test files
            'max-lines': 'off',
            'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
            // Duplicate strings are common in test selectors
            'sonarjs/no-duplicate-string': 'off',
            // Nested callbacks are common in test assertions
            'max-nested-callbacks': ['error', { max: 5 }],
            // Allow unsafe any in tests
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            // Immutability: tests mutate mock data by design
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            // JSDoc not required in test files
            'jsdoc/require-jsdoc': 'off',
            // Non-null assertions are safe in controlled test data
            '@typescript-eslint/no-non-null-assertion': 'off',
            // Prefer-readonly too strict in test setup
            '@typescript-eslint/prefer-readonly': 'off',
            // no-restricted-syntax: allow delete/Object.assign in test helpers
            'no-restricted-syntax': 'off',
            // nullish coalescing sometimes conflicts with test idioms
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            // Complexity / control flow acceptable in large spec helpers
            'sonarjs/nested-control-flow': 'off',
            'sonarjs/shorthand-property-grouping': 'off',
            'sonarjs/no-inconsistent-returns': 'off',
            // Fire-and-forget patterns are common in Playwright spec helpers
            '@typescript-eslint/no-floating-promises': 'off'
        }
    },
    // Relaxed rules for unit tests
    {
        files: ['src/**/*.test.ts'],
        rules: {
            // Type assertions are standard practice for partial test mocks
            '@typescript-eslint/no-unsafe-type-assertion': 'off',
            // Allow longer files and functions in test files
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            // Duplicate strings are common in test cases
            'sonarjs/no-duplicate-string': 'off',
            // Nested callbacks are common with describe/test/expect
            'max-nested-callbacks': ['error', { max: 6 }],
            // localStorage mock returns null per API spec
            'unicorn/no-null': 'off',
            // Direct callback references are fine in tests
            'unicorn/no-array-callback-reference': 'off',
            // Array element overwrite is intentional in test data setup
            'sonarjs/no-element-overwrite': 'off',
            // Immutability: tests mutate mock data by design
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            // JSDoc not required in test files
            'jsdoc/require-jsdoc': 'off',
            // Non-null safe in unit tests
            '@typescript-eslint/no-non-null-assertion': 'off',
            // no-restricted-syntax too strict in tests
            'no-restricted-syntax': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            // Test cleanup patterns use delete and empty callbacks
            '@typescript-eslint/no-dynamic-delete': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-unnecessary-type-parameters': 'off'
        }
    },
    // Relaxed rules for property-based tests
    {
        files: ['src/**/*.property.test.ts'],
        rules: {
            // Type assertions are standard practice for test data generation
            '@typescript-eslint/no-unsafe-type-assertion': 'off',
            // Property tests can be large
            'max-lines': 'off',
            // Property tests generate arbitrary data with fast-check
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            // Fast-check record types are complex
            'max-params': 'off',
            // Property tests often have many nested callbacks
            'max-nested-callbacks': 'off',
            // Non-null assertions are safe when we control test data
            '@typescript-eslint/no-non-null-assertion': 'off',
            // Immutability off for test data setup
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            // JSDoc not required in test files
            'jsdoc/require-jsdoc': 'off',
            'no-restricted-syntax': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off'
        }
    },
    // Relaxed rules for BDD step definitions and support files
    {
        files: ['features/**/*.ts'],
        rules: {
            // Step definition files can be large
            'max-lines': 'off',
            // Step definitions often have many parameters from Cucumber
            'max-params': 'off',
            // Duplicate strings are common in step definitions
            'sonarjs/no-duplicate-string': 'off',
            // Allow longer functions for complex step definitions
            'max-lines-per-function': 'off',
            // Allow unsafe any in test code
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            // Async step definitions may not need await
            '@typescript-eslint/require-await': 'off',
            // Non-null assertions are common in test assertions
            '@typescript-eslint/no-non-null-assertion': 'off',
            // Allow unused variables in destructuring (page, tileRequests)
            'unused-imports/no-unused-vars': 'off',
            // Complexity rules are too strict for test helpers
            'complexity': 'off',
            'sonarjs/cognitive-complexity': 'off',
            // Allow prefer-const violations (common in test code)
            'prefer-const': 'off',
            // Allow null in tests (some APIs return null)
            'unicorn/no-null': 'off',
            // Allow any patterns in test code
            'sonarjs/no-unused-vars': 'off',
            'sonarjs/no-dead-store': 'off',
            'sonarjs/pseudo-random': 'off',
            'sonarjs/prefer-regexp-exec': 'off',
            'sonarjs/no-os-command-from-path': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            // Immutability: BDD steps mutate page state by design
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            'functional/prefer-tacit': 'off',
            'functional/prefer-property-signatures': 'off',
            // JSDoc not required in step definitions
            'jsdoc/require-jsdoc': 'off',
            // JSDoc return/param descriptions overly strict for test helpers
            'jsdoc/require-returns': 'off',
            'jsdoc/require-param-description': 'off',
            // no-restricted-syntax too strict in test helpers
            'no-restricted-syntax': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/prefer-readonly': 'off',
            '@typescript-eslint/consistent-type-imports': 'off',
            // Test files use intentional type assertions for page casting patterns
            '@typescript-eslint/no-unsafe-type-assertion': 'off',
            // Loop structure in mock generators is fine in test code
            'sonarjs/nested-control-flow': 'off',
            'sonarjs/too-many-break-or-continue-in-loop': 'off',
            'sonarjs/shorthand-property-grouping': 'off',
            // evaluate() callbacks intentionally return in some paths only
            'sonarjs/no-inconsistent-returns': 'off',
            // Test URL regex patterns don't need named capture groups
            'regexp/prefer-named-capture-group': 'off',
            'regexp/no-unused-capturing-group': 'off'
        }
    },
    // Relaxed rules for test helper / fixture files
    {
        files: ['tests/helpers/**/*.ts'],
        rules: {
            // Type assertions are standard in test mocks
            '@typescript-eslint/no-unsafe-type-assertion': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            // Immutability: test helpers mutate mock data by design
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            // JSDoc param/return descriptions overly strict for test helpers
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-returns': 'off',
            'jsdoc/require-param-description': 'off',
            // Complexity acceptable in mock/fixture generators
            'sonarjs/nested-control-flow': 'off',
            'sonarjs/too-many-break-or-continue-in-loop': 'off',
            'sonarjs/shorthand-property-grouping': 'off',
            'sonarjs/no-duplicate-string': 'off',
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            'no-restricted-syntax': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off'
        }
    },
    // Relaxed rules for CLI build scripts
    {
        files: ['scripts/*.ts'],
        rules: {
            // CLI scripts can be large
            'max-lines': 'off',
            // CLI scripts commonly use process.exit
            'unicorn/no-process-exit': 'off',
            // top-level await not always appropriate for CLI entry points
            'unicorn/prefer-top-level-await': 'off',
            // CLI scripts can have higher complexity
            'complexity': ['error', { max: 25 }],
            'sonarjs/cognitive-complexity': 'off',
            'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
            // Allow more params for utility functions
            'max-params': ['error', { max: 10 }],
            // Allow forEach in scripts (simpler for logging)
            'unicorn/no-array-for-each': 'off',
            // Allow null for external API compat
            'unicorn/no-null': 'off',
            // Allow abbreviations common in scripts including "utils" in filenames
            'unicorn/prevent-abbreviations': ['error', {
                replacements: {
                    dir: false,
                    msg: false,
                    err: false,
                    i: false,
                    utils: false
                }
            }],
            // Allow unsafe any in build scripts
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            // Duplicate strings in logging are fine
            'sonarjs/no-duplicate-string': 'off',
            // Deprecated APIs may be used in test files
            'sonarjs/deprecation': 'off',
            // Allow callback reference in simple cases
            'unicorn/no-array-callback-reference': 'off',
            // Scripts mutate data structures for side-effectful CLI work
            'functional/immutable-data': 'off',
            'functional/no-let': 'off',
            'functional/prefer-immutable-types': 'off',
            'functional/prefer-tacit': 'off',
            'functional/prefer-property-signatures': 'off',
            // No JSDoc required in CLI scripts
            'jsdoc/require-jsdoc': 'off',
            // Object.assign and delete patterns allowed in scripts
            'no-restricted-syntax': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/prefer-readonly': 'off'
        }
    }
);
