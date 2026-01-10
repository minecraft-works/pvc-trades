import { defineConfig } from 'vite';

export default defineConfig({
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
