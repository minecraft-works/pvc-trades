import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import worker, { resetCache } from './index.js';

const env = { SHOPS_UPSTREAM_URL: 'https://upstream.test/shops/data.json' };
const BODY = '{"information":{},"data":[]}';
const ETAG = '"abc-123"';

function request(headers: Record<string, string> = {}): Request {
    return new Request('https://pvc-shops.test/', { headers });
}

describe('shops worker', () => {
    const upstream = vi.fn<typeof fetch>();

    beforeEach(() => {
        resetCache();
        upstream.mockReset();
        upstream.mockImplementation(() => Promise.resolve(new Response(BODY, {
            status: 200,
            headers: { ETag: ETAG, 'Last-Modified': 'Fri, 27 Nov 2026 17:41:05 GMT' },
        })));
        vi.stubGlobal('fetch', upstream);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('forwards the body with the upstream validators and revalidation caching', async () => {
        const response = await worker.fetch(request(), env);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe(BODY);
        expect(response.headers.get('ETag')).toBe(ETAG);
        expect(response.headers.get('Cache-Control')).toBe('no-cache');
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('answers 304 without a body when the client copy is current', async () => {
        const response = await worker.fetch(request({ 'If-None-Match': ETAG }), env);

        expect(response.status).toBe(304);
        expect(await response.text()).toBe('');
    });

    test('compares entity tags weakly, as Cloudflare weakens them when compressing', async () => {
        upstream.mockImplementation(() => Promise.resolve(new Response(BODY, { status: 200, headers: { ETag: `W/${ETAG}` } })));

        const strong = await worker.fetch(request({ 'If-None-Match': ETAG }), env);
        const weak = await worker.fetch(request({ 'If-None-Match': `W/${ETAG}` }), env);

        expect(strong.status).toBe(304);
        expect(weak.status).toBe(304);
    });

    test('sends the full body when the client copy is outdated', async () => {
        const response = await worker.fetch(request({ 'If-None-Match': '"old"' }), env);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe(BODY);
    });

    test('reuses the upstream response for concurrent and quick repeat requests', async () => {
        await Promise.all([worker.fetch(request(), env), worker.fetch(request(), env)]);
        await worker.fetch(request(), env);

        expect(upstream).toHaveBeenCalledTimes(1);
    });

    test('reports upstream failures as 502', async () => {
        upstream.mockImplementation(() => Promise.resolve(new Response('down', { status: 503 })));

        const response = await worker.fetch(request(), env);

        expect(response.status).toBe(502);
    });
});
