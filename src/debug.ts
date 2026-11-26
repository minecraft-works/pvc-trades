/**
 * Debug loggers for production troubleshooting.
 * 
 * Enable in browser console:
 *   localStorage.debug = 'app:*';           // all logs
 *   localStorage.debug = 'app:worldswitch'; // specific namespace
 *   localStorage.debug = 'app:tiles';       // tile loading details
 * 
 * Then reload the page.
 * 
 * IMPORTANT: In Chrome/Edge, you must enable "Verbose" log level
 * in the Console filter dropdown to see debug output.
 * 
 * Disable:
 *   delete localStorage.debug;
 */
import Debug from 'debug';

export const debugNavigation = Debug('app:navigation');
export const debugPlayerPoll = Debug('app:playerpoll');
export const debugMap = Debug('app:map');
export const debugTiles = Debug('app:tiles');
export const debugInterpolation = Debug('app:interpolation');
