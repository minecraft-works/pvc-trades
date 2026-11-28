/**
 * Right-click menu on a trade row: copy the shop's coordinates, or a sentence
 * about the trade that can be pasted in chat.
 *
 * @module rendering/trade-context-menu
 */

import { html } from 'lit-html';

import { CONTEXT_MENU } from '../constants.js';
import { formatChatMessage, formatCoordinates } from '../trade-share.js';
import type { FilterResult } from '../types.js';
import { replaceContent } from './render.js';

/** Where the menu opens, in viewport pixels */
export interface MenuPosition {
    readonly x: number;
    readonly y: number;
}

/** Public API of the trade context menu */
export interface TradeContextMenu {
    /** Open the menu for a trade; closing it returns focus to `row` */
    open: (result: FilterResult, position: MenuPosition, row: HTMLElement) => void;
    /** Open the menu on right-click, the Menu key or a long press of `row` */
    bind: (row: HTMLElement, result: FilterResult) => void;
}

/**
 * Create the context menu. Its element is added to the page on first use.
 * @returns The menu handler
 */
export function createTradeContextMenu(): TradeContextMenu {
    let menu: HTMLElement | undefined;
    let closeCurrent: (() => void) | undefined;

    function getMenu(): HTMLElement {
        if (menu) { return menu; }
        menu = document.createElement('div');
        menu.className = 'context-menu hidden';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Copy trade');
        document.body.append(menu);
        return menu;
    }

    function place(element: HTMLElement, position: MenuPosition): void {
        const { width, height } = element.getBoundingClientRect();
        const left = Math.max(0, Math.min(position.x, globalThis.innerWidth - width));
        const top = Math.max(0, Math.min(position.y, globalThis.innerHeight - height));
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
    }

    function open(result: FilterResult, position: MenuPosition, row: HTMLElement): void {
        closeCurrent?.();
        const element = getMenu();
        const abort = new AbortController();
        const { signal } = abort;

        const close = (restoreFocus: boolean): void => {
            abort.abort();
            element.classList.add('hidden');
            closeCurrent = undefined;
            if (restoreFocus) { row.focus(); }
        };
        closeCurrent = () => close(false);

        const copy = async (text: string, button: HTMLElement): Promise<void> => {
            try {
                await navigator.clipboard.writeText(text);
                button.textContent = 'Copied ✓';
            } catch {
                button.textContent = 'Copy failed';
            }
            setTimeout(() => { if (!signal.aborted) { close(true); } }, CONTEXT_MENU.COPY_FEEDBACK_MS);
        };
        const onCopy = (text: string) => (event: Event): void => {
            if (event.currentTarget instanceof HTMLElement) { void copy(text, event.currentTarget); }
        };

        replaceContent(element, html`
            <button type="button" role="menuitem" data-copy="coordinates" @click=${onCopy(formatCoordinates(result.trade))}>Copy coordinates</button>
            <button type="button" role="menuitem" data-copy="message" @click=${onCopy(formatChatMessage(result))}>Copy chat message</button>
        `);
        element.classList.remove('hidden');
        // A text selection left by the press would show the browser's own toolbar over the menu
        globalThis.getSelection()?.removeAllRanges();
        place(element, position);

        const items = [...element.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        items[0]?.focus();

        document.addEventListener('pointerdown', (event) => {
            if (!(event.target instanceof Node) || !element.contains(event.target)) { close(false); }
        }, { signal, capture: true });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(true);
                return;
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') { return; }
            const step = event.key === 'ArrowDown' ? 1 : -1;
            event.preventDefault();
            const current = items.findIndex(item => item === document.activeElement);
            items[(current + step + items.length) % items.length]?.focus();
        }, { signal });
        // The row under the menu moves or disappears on scroll and resize
        globalThis.addEventListener('scroll', () => close(false), { signal, capture: true });
        globalThis.addEventListener('resize', () => close(false), { signal });
        globalThis.addEventListener('blur', () => close(false), { signal });
    }

    /**
     * Touch has no right-click: a long press opens the menu. Android also
     * sends `contextmenu` after a long press and iOS does not, so both open it
     * and the one that comes second is ignored.
     * @param row - Trade row to open the menu from
     * @param result - Trade the row shows
     */
    function bind(row: HTMLElement, result: FilterResult): void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let start: MenuPosition = { x: 0, y: 0 };
        let longPressed = false;
        const cancel = (): void => {
            clearTimeout(timer);
            timer = undefined;
        };

        row.addEventListener('pointerdown', (event) => {
            longPressed = false;
            if (event.pointerType !== 'touch') { return; }
            start = { x: event.clientX, y: event.clientY };
            timer = setTimeout(() => {
                longPressed = true;
                open(result, start, row);
            }, CONTEXT_MENU.LONG_PRESS_MS);
        });
        row.addEventListener('pointermove', (event) => {
            if (timer && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CONTEXT_MENU.LONG_PRESS_TOLERANCE_PX) { cancel(); }
        });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
            row.addEventListener(type, cancel);
        }
        // Lifting the finger after a long press must not also open the map
        row.addEventListener('click', (event) => {
            if (!longPressed) { return; }
            longPressed = false;
            event.stopPropagation();
        });
        row.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            if (longPressed) { return; }
            // The browser got there before the timer: still a long press, so don't open again or click through
            if (timer) {
                cancel();
                longPressed = true;
            }
            // Opened from the keyboard (Menu key, Shift+F10) there is no pointer position
            const { left, bottom } = row.getBoundingClientRect();
            const fromKeyboard = event.clientX === 0 && event.clientY === 0;
            open(result, fromKeyboard ? { x: left, y: bottom } : { x: event.clientX, y: event.clientY }, row);
        });
    }

    return { open, bind };
}
