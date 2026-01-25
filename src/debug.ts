/**
 * Debug loggers for production troubleshooting.
 * 
 * Enable in browser console:
 *   localStorage.debug = 'pvc:*';           // all logs
 *   localStorage.debug = 'pvc:worldswitch'; // specific namespace
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
export const debugWorldSwitch = Debug('pvc:worldswitch');
export const debugPlayerPoll = Debug('pvc:playerpoll');
export const debugMap = Debug('pvc:map');
