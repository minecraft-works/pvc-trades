import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
        exclude: ['tests/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/types.ts', 'src/main.ts', 'src/debug.ts'],
            thresholds: {
                statements: 85,
                branches: 79,
                functions: 85,
                lines: 85
            }
        }
    }
});
