import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                fetch: 'readonly',
                console: 'readonly',
                process: 'readonly',
                requestAnimationFrame: 'readonly',
                clearInterval: 'readonly',
                setInterval: 'readonly'
            }
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'eqeqeq': 'error',
            'curly': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'no-multiple-empty-lines': ['error', { max: 1 }],
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { avoidEscape: true }],
            // Complexity rules
            'complexity': ['warn', { max: 15 }],
            'max-depth': ['warn', { max: 4 }],
            'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
            'max-params': ['warn', { max: 5 }],
            'max-nested-callbacks': ['warn', { max: 3 }]
        }
    }
);
