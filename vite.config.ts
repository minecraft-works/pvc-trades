import { defineConfig } from 'vite';

export default defineConfig({
    base: '/pvc-trades/',
    server: {
        proxy: {
            '/api/data': {
                target: 'https://web.peacefulvanilla.club/shops',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/data/, '/data.json'),
                secure: false
            }
        }
    }
});