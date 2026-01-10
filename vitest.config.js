import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
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
