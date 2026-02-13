/**
 * Debug loggers for production troubleshooting.
 * 
 * Enable in browser console:
 *   localStorage.debug = 'pvc:*';           // all logs
 *   localStorage.debug = 'pvc:worldswitch'; // specific namespace
 *   localStorage.debug = 'pvc:tiles';       // tile loading details
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

export const debugNavigation = Debug('pvc:navigation');
export const debugPlayerPoll = Debug('pvc:playerpoll');
export const debugMap = Debug('pvc:map');
export const debugTiles = Debug('pvc:tiles');
export const debugInterpolation = Debug('pvc:interpolation');
