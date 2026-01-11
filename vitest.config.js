import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
        exclude: ['tests/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/types.ts', 'src/main.ts'],
            thresholds: {
                statements: 80,
                branches: 75,
                functions: 80,
                lines: 80
            }
        }
    }
});
