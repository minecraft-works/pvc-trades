/**
 * Debug loggers for production troubleshooting.
 * 
 * Enable in browser console:
 *   localStorage.setItem('debug', 'pvc:*');           // all logs
 *   localStorage.setItem('debug', 'pvc:worldswitch'); // specific namespace
 * 
 * Then reload the page.
 * 
 * Disable:
 *   localStorage.removeItem('debug');
 */
import Debug from 'debug';

export const debugNavigation = Debug('pvc:navigation');
export const debugWorldSwitch = Debug('pvc:worldswitch');
export const debugPlayerPoll = Debug('pvc:playerpoll');
export const debugMap = Debug('pvc:map');
