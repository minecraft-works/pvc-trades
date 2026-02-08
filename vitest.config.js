import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'src/**/*.property.test.ts', 'scripts/**/*.test.ts'],
        exclude: ['tests/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/index.ts',
                'src/types.ts',
                'src/main.ts',
                'src/debug.ts',
                'src/constants.ts',
                'src/map/**/*.ts',
                'src/dialogs/**/*.ts',
                'src/favorites/**/*.ts',
                'src/navigation/**/*.ts',
                'src/search/**/*.ts',
                'src/test-globals.d.ts'
            ],
            thresholds: {
                statements: 84,
                branches: 75,
                functions: 85,
                lines: 84
            }
        }
    }
});
