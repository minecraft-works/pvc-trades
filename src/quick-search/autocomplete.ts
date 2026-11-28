/**
 * Search field menu (WAI-ARIA combobox pattern): item-name autocomplete plus
 * the field's lenses, shops and filters (see ADR-023).
 *
 * - Clicking the field, or Alt+↓, opens its menu: the field's categories,
 *   then (Buying) Shops & owners › and the filters. Categories and filters
 *   are picked in place and keep the menu open.
 * - Typing keeps the menu, below up to five matching item names; picks made
 *   there keep the typed text (except a shop found by its name).
 * - On a touch screen the first touch in the open list hides the keyboard
 *   (the field lets go of focus) and the list stays open, so browsing gets
 *   the whole screen; tapping the field again brings the keyboard back.
 * - In a submenu, typing narrows its list (text already in the field is kept
 *   and put back on leaving); Backspace or ← with nothing typed goes back.
 *
 * While the list is open: ↓/↑ move the highlight (↓ goes to the results when
 * there is no item name to complete), Enter accepts it (→ also opens a
 * submenu), Tab accepts a suggestion and continues to the next field. Esc
 * closes a menu opened by a click and keeps the search; while typing it closes
 * the list and lets the field clear itself. Without a list the keys behave
 * as usual; a fresh Backspace in an empty field removes the field's last pill.
 *
 * @module quick-search/autocomplete
 */

import { QUICK_SEARCH } from '../constants.js';
import { parseExactQuery, rankSuggestions } from '../search/query.js';

/** Colour family of a scope option: item lens, shop/owner, or trade filter */
export type ScopeTone = 'what' | 'who' | 'how';

/**
 * A suggestion that runs an action instead of filling in the field, e.g.
 * "show only this shop".
 */
export interface ActionSuggestion {
    readonly label: string;
    /** Muted text after the label */
    readonly detail: string;
    /** Read out instead of the detail, e.g. "25 trades" for a bare count */
    readonly spokenDetail?: string;
    /** Accessible description of what accepting does */
    readonly actionLabel: string;
    readonly tone: ScopeTone;
    /** Already active: shown with a check mark */
    readonly current?: boolean;
    /** Nothing to show for it right now: dimmed */
    readonly empty?: boolean;
    /** Picked in place from a menu: it stays open, like a filter row */
    readonly keepOpen?: boolean;
    readonly accept: () => void;
}

/** A list the menu can drill into */
export interface Submenu {
    readonly id: string;
    readonly title: string;
    /** Grid for short labels (lenses), list for long ones (shops) */
    readonly layout: 'list' | 'grid';
    /** Entries for the text typed since opening it */
    readonly getEntries: (query: string) => readonly MenuEntry[];
}

/** A row of a field menu */
export type MenuEntry =
    | { readonly kind: 'action'; readonly action: ActionSuggestion }
    | {
        readonly kind: 'toggle';
        readonly label: string;
        /** Muted text, e.g. the keyboard shortcut */
        readonly detail: string;
        readonly title: string;
        readonly checked: boolean;
        readonly toggle: () => void;
    }
    | {
        readonly kind: 'submenu';
        readonly label: string;
        readonly detail: string;
        readonly tone: ScopeTone;
        readonly submenu: Submenu;
    }
    | {
        readonly kind: 'heading';
        readonly label: string;
        /** Stable name of the section the heading starts, for the layout (e.g. "biomes") */
        readonly section?: string;
    };

/** Lenses, shops and filters a field offers besides item names */
export interface FieldMenu {
    /** Rows listed after the item names for typed text */
    readonly getActions: (query: string) => readonly MenuEntry[];
    /** Rows of the menu opened by a click or Alt+↓ */
    readonly getRootMenu: () => readonly MenuEntry[];
    /** Grid for a menu of short tiles (the categories); list by default */
    readonly rootLayout?: 'list' | 'grid';
    /** Remove the field's last pill (Backspace in an empty field); true if one was removed */
    readonly removeLast?: () => boolean;
}

/** Public API */
export interface Autocomplete {
    /**
     * Handle a keydown in the field. Returns true if the event was fully
     * handled (the caller should stop), false to let normal handling continue.
     */
    handleKeydown: (event: KeyboardEvent) => boolean;
    /** Close the list */
    close: () => void;
    /** Focus the field and open its menu, or one of its submenus by ID */
    openMenu: (submenuId?: string) => void;
    /** Re-render an open list, e.g. after the scope changed elsewhere */
    refresh: () => void;
}

type Suggestion =
    | MenuEntry
    | { readonly kind: 'name'; readonly name: string }
    | { readonly kind: 'back'; readonly label: string };

type Mode =
    | { readonly kind: 'closed' }
    | { readonly kind: 'typing' }
    | { readonly kind: 'root' }
    | { readonly kind: 'submenu'; readonly submenu: Submenu };

const NO_MENU: FieldMenu = { getActions: () => [], getRootMenu: () => [] };
const CLOSED: Mode = { kind: 'closed' };
const ARIA_LABEL = 'aria-label';

let instanceCount = 0;

/**
 * Layer behind an open list, shared by both fields. A click or tap outside
 * the list only closes it, instead of also opening what lies underneath
 * (a trade row, the map) — on a phone the list covers most of the page.
 */
let backdrop: HTMLElement | undefined;
/** Closes the list that is open, if any */
let dismissOpenList: (() => void) | undefined;

function getBackdrop(): HTMLElement {
    if (backdrop) { return backdrop; }
    const element = document.createElement('div');
    element.className = 'search-menu-backdrop hidden';
    element.setAttribute('aria-hidden', 'true');
    // Keep focus in the field: its blur would close the list before the click lands here
    element.addEventListener('mousedown', (event) => { event.preventDefault(); });
    element.addEventListener('click', () => { dismissOpenList?.(); });
    document.body.append(element);
    backdrop = element;
    return element;
}

/**
 * Show the backdrop for an open list
 * @param dismiss - Closes that list
 */
function showBackdrop(dismiss: () => void): void {
    // The other field's list can still be open while browsing it by touch (the field let go of focus)
    if (dismissOpenList && dismissOpenList !== dismiss) { dismissOpenList(); }
    dismissOpenList = dismiss;
    getBackdrop().classList.remove('hidden');
}

/**
 * Hide the backdrop when the list it belongs to closes
 * @param dismiss - Closes that list
 */
function hideBackdrop(dismiss: () => void): void {
    if (dismissOpenList !== dismiss) { return; }
    dismissOpenList = undefined;
    getBackdrop().classList.add('hidden');
}

/**
 * Fill a menu row: an optional leading symbol, the label and muted detail
 * @param option - Row to fill
 * @param icon - Symbol that carries state or direction (☐/☑, ‹), if any
 * @param label - Main text
 * @param detail - Muted text after the label
 */
function appendParts(option: HTMLLIElement, icon: string | undefined, label: string, detail: string): void {
    if (icon !== undefined) {
        const iconElement = document.createElement('span');
        iconElement.className = 'suggestion-icon';
        iconElement.setAttribute('aria-hidden', 'true');
        iconElement.textContent = icon;
        option.append(iconElement);
    }
    const labelElement = document.createElement('span');
    labelElement.className = 'suggestion-label';
    labelElement.textContent = label;
    const detailElement = document.createElement('span');
    detailElement.className = 'suggestion-detail';
    detailElement.textContent = detail;
    option.append(labelElement, detailElement);
}

/**
 * Build the list entry for a suggestion
 * @param suggestion - Row to show
 * @param option - List element to fill
 */
function fillOption(suggestion: Exclude<Suggestion, { kind: 'heading' }>, option: HTMLLIElement): void {
    switch (suggestion.kind) {
        case 'name': {
            option.textContent = suggestion.name;
            return;
        }
        case 'back': {
            option.classList.add('search-suggestion-back');
            option.setAttribute(ARIA_LABEL, `Back from ${suggestion.label}`);
            appendParts(option, '‹', suggestion.label, '');
            return;
        }
        case 'action': {
            const { label, detail, spokenDetail = detail, actionLabel, tone, current, empty } = suggestion.action;
            option.classList.add('search-suggestion-action', `search-suggestion--${tone}`);
            option.classList.toggle('is-current', current === true);
            option.classList.toggle('is-empty', empty === true);
            option.setAttribute(ARIA_LABEL, `${actionLabel}: ${label}, ${spokenDetail}${current ? ', active' : ''}`);
            appendParts(option, undefined, label, detail);
            return;
        }
        case 'toggle': {
            // Same look as a picked category: no checkbox glyph, ticked filters are marked like the active category
            option.classList.add('search-suggestion-toggle', 'search-suggestion--how');
            option.classList.toggle('is-current', suggestion.checked);
            option.setAttribute('aria-checked', String(suggestion.checked));
            option.title = suggestion.title;
            appendParts(option, undefined, suggestion.label, suggestion.detail);
            return;
        }
        case 'submenu': {
            option.classList.add('search-suggestion-submenu', `search-suggestion--${suggestion.tone}`);
            option.setAttribute(ARIA_LABEL, `${suggestion.label}, ${suggestion.detail}, opens a list`);
            appendParts(option, undefined, suggestion.label, `${suggestion.detail} ›`);
            return;
        }
    }
}

/**
 * Attach the menu to a search field.
 * @param input - Search field (its parent must be positioned)
 * @param getNames - Unique item names to suggest from
 * @param menu - Lenses, shops and filters of this field
 * @returns Autocomplete handler
 */
export function createAutocomplete(
    input: HTMLInputElement,
    getNames: () => readonly string[],
    menu: FieldMenu = NO_MENU
): Autocomplete {
    instanceCount++;
    const listId = `${input.id}-suggestions`;

    const list = document.createElement('ul');
    list.id = listId;
    list.className = 'search-suggestions hidden';
    list.setAttribute('role', 'listbox');
    list.setAttribute(ARIA_LABEL, 'Item suggestions');
    // Keep focus in the field when the list's scrollbar is dragged
    list.addEventListener('mousedown', (event) => { event.preventDefault(); });
    input.parentElement?.append(list);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');
    // The browser's own saved-entry dropdown would stack on top of ours
    input.setAttribute('autocomplete', 'off');

    let mode: Mode = CLOSED;
    let suggestions: readonly Suggestion[] = [];
    let highlighted = -1;
    let acceptedValue: string | undefined;
    // Text in the field when a submenu opened: only what is typed after it filters the submenu,
    // and it is put back when the submenu is left
    let submenuBase = '';
    // Browsing the list by touch: the field let go of focus to hide a phone's
    // keyboard, and the list stays open without it until it closes or the field is used again
    let browsing = false;
    // The option element of each suggestion (undefined for headings), by suggestion index
    let optionElements: readonly (HTMLLIElement | undefined)[] = [];
    let sectionCount = 0;

    function createOption(suggestion: Exclude<Suggestion, { kind: 'heading' }>, index: number): HTMLLIElement {
        const option = document.createElement('li');
        option.id = `${listId}-${instanceCount}-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        fillOption(suggestion, option);
        // mousedown (not click) so the field keeps focus
        option.addEventListener('mousedown', (event) => {
            event.preventDefault();
            highlighted = index;
            accept(suggestion);
            // A pick by pointer leaves no keyboard highlight behind: on the
            // menu it would look like a second kind of "selected"
            if (mode.kind === 'root' || mode.kind === 'typing') {
                highlighted = -1;
                renderHighlight();
            }
        });
        return option;
    }

    function renderHighlight(): void {
        for (const [index, option] of optionElements.entries()) {
            option?.setAttribute('aria-selected', String(index === highlighted));
        }
        const active = optionElements[highlighted];
        if (active) {
            input.setAttribute('aria-activedescendant', active.id);
            active.scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    /**
     * Start a section of the list: a heading (if any) and a group for its rows.
     * Sections let wide screens put Categories, Biomes and the rest side by side.
     * @param heading - Heading that starts the section; none for rows above the first heading
     * @returns The section element and the group its rows go in
     */
    function createSection(heading?: Extract<Suggestion, { kind: 'heading' }>): { section: HTMLLIElement; group: HTMLUListElement } {
        const section = document.createElement('li');
        section.setAttribute('role', 'presentation');
        section.className = 'search-suggestion-section';
        const group = document.createElement('ul');
        group.setAttribute('role', 'group');
        group.className = 'search-suggestion-group';
        if (heading) {
            const title = document.createElement('div');
            title.id = `${listId}-${instanceCount}-section-${String(sectionCount++)}`;
            title.className = 'search-suggestion-heading';
            title.textContent = heading.label;
            group.setAttribute('aria-labelledby', title.id);
            if (heading.section) { section.dataset.section = heading.section; }
            section.append(title);
        }
        section.append(group);
        return { section, group };
    }

    function renderList(): void {
        const sections: HTMLLIElement[] = [];
        const options: (HTMLLIElement | undefined)[] = [];
        let group: HTMLUListElement | undefined;
        for (const [index, suggestion] of suggestions.entries()) {
            if (suggestion.kind === 'heading' || !group) {
                const created = createSection(suggestion.kind === 'heading' ? suggestion : undefined);
                sections.push(created.section);
                group = created.group;
            }
            if (suggestion.kind === 'heading') {
                options.push(undefined);
                continue;
            }
            const option = createOption(suggestion, index);
            group.append(option);
            options.push(option);
        }
        optionElements = options;
        list.replaceChildren(...sections);
        const isOpen = suggestions.length > 0;
        // While typing, the field's menu follows the item names
        const isMenu = mode.kind === 'root' || mode.kind === 'submenu' || suggestions.some(suggestion => suggestion.kind !== 'name');
        const isGrid = mode.kind === 'submenu' ? mode.submenu.layout === 'grid' : isMenu && menu.rootLayout === 'grid';
        list.classList.toggle('hidden', !isOpen);
        list.classList.toggle('search-suggestions--menu', isMenu);
        list.classList.toggle('search-suggestions--grid', isGrid);
        list.setAttribute(ARIA_LABEL, isMenu ? 'Search options' : 'Item suggestions');
        input.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) {
            fitAboveKeyboard();
            showBackdrop(dismiss);
        } else {
            hideBackdrop(dismiss);
        }
        renderHighlight();
    }

    /**
     * Keep the open list above a phone's on-screen keyboard. The keyboard only
     * shrinks the visual viewport, which CSS viewport units don't follow, so
     * the room below the list's top goes to its max-height (--menu-room).
     */
    function fitAboveKeyboard(): void {
        if (list.classList.contains('hidden')) { return; }
        const viewport = globalThis.visualViewport;
        const visibleBottom = viewport ? viewport.offsetTop + viewport.height : globalThis.innerHeight;
        const room = visibleBottom - list.getBoundingClientRect().top - QUICK_SEARCH.MENU_KEYBOARD_GAP_PX;
        list.style.setProperty('--menu-room', `${String(Math.round(Math.max(room, QUICK_SEARCH.MENU_MIN_HEIGHT_PX)))}px`);
    }

    /** Close the list and leave the field (also hides a phone's keyboard) */
    function dismiss(): void {
        close();
        input.blur();
    }

    function show(next: Mode, entries: readonly Suggestion[], highlight = -1): void {
        mode = entries.length > 0 ? next : CLOSED;
        suggestions = entries;
        highlighted = Math.min(highlight, entries.length - 1);
        renderList();
    }

    function close(): void {
        browsing = false;
        show(CLOSED, []);
    }

    function openRoot(highlight = -1): void {
        show({ kind: 'root' }, menu.getRootMenu(), highlight);
    }

    /**
     * Text typed since the submenu opened
     * @returns The submenu's filter text
     */
    function submenuQuery(): string {
        return input.value.startsWith(submenuBase) ? input.value.slice(submenuBase.length) : '';
    }

    function submenuEntries(submenu: Submenu): readonly Suggestion[] {
        return [{ kind: 'back', label: submenu.title }, ...submenu.getEntries(submenuQuery())];
    }

    function openSubmenu(submenu: Submenu, highlight: number): void {
        show({ kind: 'submenu', submenu }, submenuEntries(submenu), highlight);
    }

    function showTyped(value: string, highlight = -1): void {
        const actions = menu.getActions(value);
        // An exact query ("emerald") or a single letter only needs the menu, not names
        const wantsNames = parseExactQuery(value) === undefined && value.trim().length >= QUICK_SEARCH.MIN_SUGGESTION_CHARS;
        const limit = actions.length > 0 ? QUICK_SEARCH.MAX_SUGGESTIONS_WITH_MENU : QUICK_SEARCH.MAX_SUGGESTIONS;
        const ranked = wantsNames ? rankSuggestions(getNames(), value, limit) : [];
        // Nothing to add when the only name suggestion is exactly what was typed
        const names = ranked.length === 1 && ranked[0]?.toLowerCase() === value.trim().toLowerCase() ? [] : ranked;
        show({ kind: 'typing' }, [...names.map((name): Suggestion => ({ kind: 'name', name })), ...actions], highlight);
    }

    function update(): void {
        const value = input.value;
        if (mode.kind === 'submenu') {
            openSubmenu(mode.submenu, -1);
            return;
        }
        if (value === acceptedValue) {
            close();
            return;
        }
        acceptedValue = undefined;
        if (!value.trim()) {
            // Clearing the text while a list is open brings back the menu
            if (mode.kind === 'closed') { close(); } else { openRoot(); }
            return;
        }
        showTyped(value);
    }

    function refresh(): void {
        switch (mode.kind) {
            case 'root': {
                openRoot(highlighted);
                break;
            }
            case 'submenu': {
                openSubmenu(mode.submenu, highlighted);
                break;
            }
            case 'typing': {
                showTyped(input.value, highlighted);
                break;
            }
            case 'closed': {
                break;
            }
        }
    }

    function dispatchInput(): void {
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /** Clear the field after a pick that the typed text was only looking for */
    function clearTypedText(): void {
        acceptedValue = '';
        input.value = '';
        close();
    }

    function goBack(): void {
        mode = { kind: 'root' };
        if (input.value !== submenuBase) {
            // Put back the search the submenu filter was typed after
            input.value = submenuBase;
            acceptedValue = undefined;
            dispatchInput();
        }
        openRoot();
    }

    function acceptAction(action: ActionSuggestion): void {
        if (action.keepOpen && mode.kind !== 'submenu') {
            // Picked in place: the search text stays and narrows the counts
            action.accept();
            refresh();
            return;
        }
        if (mode.kind === 'typing') {
            // A shop found by its name: the text was only looking for it
            clearTypedText();
            action.accept();
            dispatchInput();
            return;
        }
        const restore = mode.kind === 'submenu' && input.value !== submenuBase;
        if (restore) {
            input.value = submenuBase;
            acceptedValue = submenuBase;
        }
        close();
        action.accept();
        if (restore) { dispatchInput(); }
    }

    function accept(suggestion: Suggestion): void {
        switch (suggestion.kind) {
            case 'name': {
                acceptedValue = suggestion.name;
                input.value = suggestion.name;
                close();
                dispatchInput();
                return;
            }
            case 'action': {
                acceptAction(suggestion.action);
                return;
            }
            case 'toggle': {
                // Ticked in place, keeping the search text, like a category
                suggestion.toggle();
                refresh();
                return;
            }
            case 'submenu': {
                submenuBase = input.value;
                openSubmenu(suggestion.submenu, 1);
                return;
            }
            case 'back': {
                goBack();
                return;
            }
            case 'heading': {
                return;
            }
        }
    }

    function moveHighlight(step: number): void {
        let next = highlighted + step;
        while (next >= 0 && next < suggestions.length && suggestions[next]?.kind === 'heading') { next += step; }
        if (next >= suggestions.length) { return; }
        highlighted = Math.max(-1, next);
        renderHighlight();
    }

    function openMenu(submenuId?: string): void {
        input.focus();
        const entry = submenuId === undefined
            ? undefined
            : menu.getRootMenu().find(candidate => candidate.kind === 'submenu' && candidate.submenu.id === submenuId);
        if (entry?.kind === 'submenu') {
            submenuBase = input.value;
            openSubmenu(entry.submenu, 1);
            return;
        }
        openRoot();
    }

    function handleBackspace(event: KeyboardEvent): boolean {
        if (mode.kind === 'submenu' && submenuQuery() === '') {
            event.preventDefault();
            goBack();
            return true;
        }
        // A held key (auto-repeat after clearing the text) must not remove every pill
        if (input.value || event.repeat) { return false; }
        if (mode.kind === 'submenu') {
            event.preventDefault();
            goBack();
            return true;
        }
        if (menu.removeLast?.()) {
            event.preventDefault();
            refresh();
            return true;
        }
        return false;
    }

    /**
     * → on a submenu row opens it
     * @param event - Keydown in the field
     * @returns True if a submenu was opened
     */
    function enterSubmenu(event: KeyboardEvent): boolean {
        const current = suggestions[highlighted];
        if (current?.kind !== 'submenu') { return false; }
        event.preventDefault();
        accept(current);
        return true;
    }

    /**
     * ← in a submenu with nothing typed in it goes back
     * @param event - Keydown in the field
     * @returns True if the menu went back
     */
    function leaveSubmenu(event: KeyboardEvent): boolean {
        if (mode.kind !== 'submenu' || submenuQuery()) { return false; }
        event.preventDefault();
        goBack();
        return true;
    }

    function acceptHighlighted(event: KeyboardEvent): boolean {
        const current = suggestions[highlighted];
        if (current === undefined) { return false; }
        event.preventDefault();
        accept(current);
        return true;
    }

    /**
     * Tab accepts a highlighted suggestion (not a menu row) and lets focus move on
     * @param event - Keydown in the field
     */
    function acceptOnTab(event: KeyboardEvent): void {
        const current = suggestions[highlighted];
        if (current !== undefined && !event.shiftKey && (current.kind === 'name' || current.kind === 'action')) { accept(current); }
        close();
    }

    /**
     * ↓/↑ move the highlight; with no item name to complete, ↓ from the field
     * still goes into the results (the menu under typed text closes)
     * @param event - Keydown in the field
     * @returns True if the highlight moved
     */
    function moveOrLeave(event: KeyboardEvent): boolean {
        const down = event.key === 'ArrowDown';
        if (down && highlighted === -1 && mode.kind === 'typing' && !suggestions.some(suggestion => suggestion.kind === 'name')) {
            close();
            return false;
        }
        event.preventDefault();
        moveHighlight(down ? 1 : -1);
        return true;
    }

    function handleListKey(event: KeyboardEvent): boolean {
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                return moveOrLeave(event);
            }
            case 'ArrowRight': {
                return enterSubmenu(event);
            }
            case 'ArrowLeft': {
                return leaveSubmenu(event);
            }
            case 'Enter': {
                return acceptHighlighted(event);
            }
            case 'Tab': {
                acceptOnTab(event);
                return false;
            }
            case 'Escape': {
                // Esc closes a menu opened by a click but keeps the search; while typing it also lets the field clear
                const isMenu = mode.kind === 'root' || mode.kind === 'submenu';
                close();
                if (isMenu) { event.preventDefault(); }
                return isMenu;
            }
            default: {
                return false;
            }
        }
    }

    function handleKeydown(event: KeyboardEvent): boolean {
        if (event.isComposing) { return false; }
        if (event.key === 'ArrowDown' && event.altKey) {
            event.preventDefault();
            if (mode.kind === 'closed') { openRoot(); }
            return true;
        }
        if (event.key === 'Backspace') { return handleBackspace(event); }
        if (suggestions.length === 0) { return false; }
        return handleListKey(event);
    }

    input.addEventListener('input', update);
    input.addEventListener('blur', () => {
        if (!browsing) { close(); }
    });
    input.addEventListener('focus', () => { browsing = false; });
    // The first touch in an open list (a tap or a scroll) makes room for it: the field
    // lets go of focus, which hides a phone's keyboard, and the list grows to fit
    list.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch' || mode.kind === 'closed' || document.activeElement !== input) { return; }
        browsing = true;
        input.blur();
    });
    // The on-screen keyboard opening or closing resizes the visual viewport
    globalThis.visualViewport?.addEventListener('resize', fitAboveKeyboard);
    globalThis.visualViewport?.addEventListener('scroll', fitAboveKeyboard);
    // A click means browsing: show the menu (typing switches to suggestions)
    input.addEventListener('click', () => {
        if (mode.kind === 'closed') { openRoot(); }
    });

    return { handleKeydown, close, openMenu, refresh };
}
