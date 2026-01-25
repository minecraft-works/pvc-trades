import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
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
                    allowDefaultProject: ['*.test.ts', 'src/*.test.ts', 'tests/*.spec.ts'],
                    defaultProject: './tsconfig.eslint.json'
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
    }
);
