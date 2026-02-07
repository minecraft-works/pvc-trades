import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
    // Ignore generated and build files
    {
        ignores: [
            '.features-gen/**',
            'dist/**',
            'docs/api/**',
            'reports/**',
            'test-results/**',
            'playwright-report/**',
            'node_modules/**',
            '*.cjs',
            '*.config.js',
            '*.config.ts',
            'eslint.config.js'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    unicorn.configs.recommended,
    sonarjs.configs.recommended,
    {
        plugins: {
            'unused-imports': unusedImports
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.test.ts', 'src/*.test.ts', 'src/stores/*.test.ts', 'tests/*.spec.ts', 'tests/helpers/*.ts', 'features/*.ts', 'features/steps/*.ts', 'features/support/*.ts', 'features/step-definitions/*.ts', 'scripts/*.ts'],
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

            // Complexity rules - STRICT
            'complexity': ['error', { max: 15 }],
            'max-depth': ['error', { max: 4 }],
            'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
            'max-params': ['error', { max: 5 }],
            'max-nested-callbacks': ['error', { max: 3 }],

            // SonarJS - STRICT
            'sonarjs/cognitive-complexity': ['error', 15],
            'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
            'sonarjs/no-identical-functions': 'error',

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

            // Type-checked rules - allow some common patterns
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/restrict-template-expressions': ['error', {
                allowNumber: true,
                allowBoolean: true
            }],
            '@typescript-eslint/no-unnecessary-condition': 'warn',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/restrict-plus-operands': ['error', {
                allowNumberAndString: true
            }],
            '@typescript-eslint/no-misused-spread': 'warn',
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-misused-promises': 'warn',
            '@typescript-eslint/require-await': 'warn',
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'warn',
            '@typescript-eslint/no-deprecated': 'warn',
            
            // Unicorn adjustments for getElementById pattern
            'unicorn/prefer-query-selector': 'warn'
        }
    },
    // Relaxed rules for spec tests - these are large legacy test files
    {
        files: ['tests/**/*.spec.ts'],
        rules: {
            // Allow longer functions in test files
            'max-lines-per-function': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
            // Duplicate strings are common in test selectors
            'sonarjs/no-duplicate-string': 'off',
            // Nested callbacks are common in test assertions
            'max-nested-callbacks': ['error', { max: 5 }],
            // Allow unsafe any in tests
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off'
        }
    },
    // Relaxed rules for unit tests
    {
        files: ['src/**/*.test.ts'],
        rules: {
            // Allow longer functions in test files (test suites can be large)
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
            'sonarjs/no-element-overwrite': 'off'
        }
    },
    // Relaxed rules for property-based tests
    {
        files: ['src/**/*.property.test.ts'],
        rules: {
            // Property tests generate arbitrary data with fast-check
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            // Fast-check record types are complex
            'max-params': 'off',
            // Property tests often have many nested callbacks
            'max-nested-callbacks': 'off',
            // Non-null assertions are safe when we control test data
            '@typescript-eslint/no-non-null-assertion': 'off'
        }
    },
    // Relaxed rules for BDD step definitions and support files
    {
        files: ['features/**/*.ts'],
        rules: {
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
            '@typescript-eslint/no-unnecessary-condition': 'off'
        }
    }
);
