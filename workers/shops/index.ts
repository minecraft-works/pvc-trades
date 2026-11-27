/**
 * shops — Cloudflare Worker
 *
 * Proxies the map server's shop list (`data.json`) with CORS headers, since
 * browsers cannot read it directly. Conditional requests are passed through:
 * the response keeps the upstream `ETag`/`Last-Modified` and is served with
 * `Cache-Control: no-cache`, so a browser refresh of unchanged data is a 304
 * instead of a full download.
 *
 * Configure the upstream in wrangler.toml (`SHOPS_UPSTREAM_URL`).
 * Deploy: `cd workers/shops && npx wrangler deploy`
 */

export interface Env {
    /** URL of the map server's shop list, e.g. `https://example.com/shops/data.json` */
    SHOPS_UPSTREAM_URL: string;
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': 'ETag, Last-Modified',
};

/** How long one upstream response is reused before asking upstream again */
const UPSTREAM_CACHE_MS = 15_000;

/** Upstream headers forwarded to the client */
const VALIDATOR_HEADERS = ['etag', 'last-modified'] as const;

interface CachedResponse {
    readonly body: string;
    readonly validators: Readonly<Record<string, string>>;
    readonly fetchedAt: number;
}

let cached: CachedResponse | undefined;
let inFlight: Promise<CachedResponse> | undefined;

function responseHeaders(validators: Readonly<Record<string, string>>): Headers {
    return new Headers({
        ...CORS_HEADERS,
        ...validators,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
    });
}

async function fetchUpstream(url: string): Promise<CachedResponse> {
    const etag = cached?.validators.etag;
    const upstream = await fetch(url, etag ? { headers: { 'If-None-Match': etag } } : {});
    if (upstream.status === 304 && cached) {
        return { ...cached, fetchedAt: Date.now() };
    }
    if (!upstream.ok) {
        throw new Error(`Upstream returned ${String(upstream.status)}`);
    }
    const validators = Object.fromEntries(VALIDATOR_HEADERS
        .map(name => [name, upstream.headers.get(name)] as const)
        .filter((pair): pair is readonly [typeof pair[0], string] => pair[1] !== null));
    const body = await upstream.text();
    return { body, validators, fetchedAt: Date.now() };
}

/**
 * Get the shop list, reusing a fresh cached copy and sharing concurrent upstream requests.
 * @param url - Upstream shop list URL
 * @returns Latest upstream body and its validators
 */
async function getShops(url: string): Promise<CachedResponse> {
    if (cached && Date.now() - cached.fetchedAt < UPSTREAM_CACHE_MS) {
        return cached;
    }
    inFlight ??= fetchUpstream(url)
        .then((response) => {
            cached = response;
            return response;
        })
        .finally(() => { inFlight = undefined; });
    return inFlight;
}

/**
 * Entity tag without the weak prefix: If-None-Match uses weak comparison, and
 * Cloudflare weakens ETags (`W/"…"`) whenever it compresses a response.
 * @param tag - Entity tag, e.g. `W/"abc"` or `"abc"`
 * @returns The opaque tag, e.g. `"abc"`
 */
function opaqueTag(tag: string): string {
    return tag.trim().replace(/^W\//, '');
}

/**
 * Whether the client's cached copy is still current.
 * @param request - Incoming request
 * @param validators - Validators of the latest upstream response
 * @returns True when the client can reuse its copy
 */
function isNotModified(request: Request, validators: Readonly<Record<string, string>>): boolean {
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch !== null) {
        const etag = validators.etag;
        return etag !== undefined && ifNoneMatch.split(',').some(tag => opaqueTag(tag) === opaqueTag(etag));
    }
    const ifModifiedSince = request.headers.get('If-Modified-Since');
    return ifModifiedSince !== null && validators['last-modified'] === ifModifiedSince;
}

/** Forget the cached upstream response (tests only) */
export function resetCache(): void {
    cached = undefined;
    inFlight = undefined;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(undefined, { status: 204, headers: CORS_HEADERS });
        }

        try {
            const shops = await getShops(env.SHOPS_UPSTREAM_URL);
            const headers = responseHeaders(shops.validators);
            if (isNotModified(request, shops.validators)) {
                return new Response(undefined, { status: 304, headers });
            }
            return new Response(shops.body, { status: 200, headers });
        } catch (error) {
            return Response.json(
                { error: error instanceof Error ? error.message : 'Upstream request failed' },
                { status: 502, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
            );
        }
    },
};
