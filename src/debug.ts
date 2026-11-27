/**
 * Debug loggers for production troubleshooting.
 *
 * Enable in browser console, then reload the page:
 *   localStorage.debug = 'app:*';           // all logs
 *   localStorage.debug = 'app:tiles';       // tile loading details
 *   localStorage.debug = 'app:*,-app:tiles'; // all but tile loading
 *
 * In Chrome/Edge, enable the "Verbose" log level in the Console filter
 * dropdown to see the output.
 *
 * Disable:
 *   delete localStorage.debug;
 */

/** printf-style logger, e.g. `debugMap('zoom %d', zoom)` */
type Logger = (format: string, ...arguments_: readonly unknown[]) => void;

function noop(): void { /* logging disabled */ }

function toRegExp(pattern: string): Readonly<RegExp> {
    const escaped = pattern.replaceAll(/[$()+.?[\\\]^{|}]/g, String.raw`\$&`).replaceAll('*', '.*?');
    return new RegExp(`^${escaped}$`);
}

/**
 * Whether a namespace is enabled by a `localStorage.debug` value: a comma or
 * space separated list of names with `*` wildcards; a leading `-` excludes.
 * @param namespace - Logger namespace, e.g. `app:tiles`
 * @param setting - The `localStorage.debug` value
 * @returns True when the namespace should log
 */
export function isNamespaceEnabled(namespace: string, setting: string): boolean {
    const patterns = setting.split(/[\s,]+/).filter(Boolean);
    const excluded = patterns.some(p => p.startsWith('-') && toRegExp(p.slice(1)).test(namespace));
    return !excluded && patterns.some(p => !p.startsWith('-') && toRegExp(p).test(namespace));
}

function readSetting(): string {
    try {
        return globalThis.localStorage.getItem('debug') ?? '';
    } catch {
        return '';
    }
}

function createLogger(namespace: string): Logger {
    if (!isNamespaceEnabled(namespace, readSetting())) { return noop; }
    return (format, ...arguments_) => { console.debug(`${namespace} ${format}`, ...arguments_); };
}

export const debugNavigation = createLogger('app:navigation');
export const debugPlayerPoll = createLogger('app:playerpoll');
export const debugMap = createLogger('app:map');
export const debugTiles = createLogger('app:tiles');
export const debugInterpolation = createLogger('app:interpolation');
