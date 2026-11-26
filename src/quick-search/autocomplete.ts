/**
 * Item-name autocomplete for a search field (WAI-ARIA combobox pattern).
 *
 * While the list is open: ↓/↑ move the highlight, Enter accepts it, Tab
 * accepts it and then continues to the next field. Esc closes the list and
 * lets the field clear itself. Without suggestions the keys behave as usual.
 *
 * @module quick-search/autocomplete
 */

import { QUICK_SEARCH } from '../constants.js';
import { parseExactQuery, rankSuggestions } from '../search/query.js';

/** Public API */
export interface Autocomplete {
    /**
     * Handle a keydown in the field. Returns true if the event was fully
     * handled (the caller should stop), false to let normal handling continue.
     */
    handleKeydown: (event: KeyboardEvent) => boolean;
    /** Close the suggestion list */
    close: () => void;
}

let instanceCount = 0;

/**
 * Attach autocomplete to a search field.
 * @param input - Search field (its parent must be positioned)
 * @param getNames - Unique item names to suggest from
 * @returns Autocomplete handler
 */
export function createAutocomplete(input: HTMLInputElement, getNames: () => readonly string[]): Autocomplete {
    instanceCount++;
    const listId = `${input.id}-suggestions`;

    const list = document.createElement('ul');
    list.id = listId;
    list.className = 'search-suggestions hidden';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Item suggestions');
    input.parentElement?.append(list);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');

    let suggestions: readonly string[] = [];
    let highlighted = -1;
    let acceptedValue: string | undefined;

    function render(): void {
        list.replaceChildren(...suggestions.map((name, index) => {
            const option = document.createElement('li');
            option.id = `${listId}-${instanceCount}-${index}`;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(index === highlighted));
            option.textContent = name;
            // mousedown (not click) so the field keeps focus
            option.addEventListener('mousedown', (event) => {
                event.preventDefault();
                accept(name);
            });
            return option;
        }));
        const isOpen = suggestions.length > 0;
        list.classList.toggle('hidden', !isOpen);
        input.setAttribute('aria-expanded', String(isOpen));
        const active = list.children[highlighted];
        if (active) {
            input.setAttribute('aria-activedescendant', active.id);
            active.scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    function update(): void {
        const value = input.value;
        if (value === acceptedValue || parseExactQuery(value) !== undefined || value.trim().length < QUICK_SEARCH.MIN_SUGGESTION_CHARS) {
            close();
            return;
        }
        acceptedValue = undefined;
        const ranked = rankSuggestions(getNames(), value, QUICK_SEARCH.MAX_SUGGESTIONS);
        // Nothing to add when the only suggestion is exactly what was typed
        suggestions = ranked.length === 1 && ranked[0]?.toLowerCase() === value.trim().toLowerCase() ? [] : ranked;
        highlighted = -1;
        render();
    }

    function accept(name: string): void {
        acceptedValue = name;
        input.value = name;
        close();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function close(): void {
        suggestions = [];
        highlighted = -1;
        render();
    }

    function moveHighlight(step: number): void {
        highlighted = Math.max(-1, Math.min(suggestions.length - 1, highlighted + step));
        render();
    }

    function handleKeydown(event: KeyboardEvent): boolean {
        if (suggestions.length === 0 || event.isComposing) { return false; }
        const current = suggestions[highlighted];

        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                event.preventDefault();
                moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
                return true;
            }
            case 'Enter': {
                if (current === undefined) { return false; }
                event.preventDefault();
                accept(current);
                return true;
            }
            case 'Tab': {
                if (current !== undefined && !event.shiftKey) { accept(current); }
                close();
                return false;
            }
            case 'Escape': {
                close();
                return false;
            }
            default: {
                return false;
            }
        }
    }

    input.addEventListener('input', update);
    input.addEventListener('blur', close);

    return { handleKeydown, close };
}
