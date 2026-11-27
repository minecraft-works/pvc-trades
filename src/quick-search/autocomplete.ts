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

/**
 * A suggestion that runs an action instead of filling in the field, e.g.
 * "show only this shop". Accepting it clears the field.
 */
export interface ActionSuggestion {
    /** Leading symbol, e.g. "🏪" */
    readonly icon: string;
    readonly label: string;
    /** Muted text after the label */
    readonly detail: string;
    /** Accessible description of what accepting does */
    readonly actionLabel: string;
    readonly accept: () => void;
}

type Suggestion =
    | { readonly kind: 'name'; readonly name: string }
    | { readonly kind: 'action'; readonly action: ActionSuggestion };

let instanceCount = 0;

/**
 * Build the list entry for a suggestion
 * @param suggestion - Item name or action suggestion
 * @param option - List element to fill
 */
function fillOption(suggestion: Suggestion, option: HTMLLIElement): void {
    if (suggestion.kind === 'name') {
        option.textContent = suggestion.name;
        return;
    }
    const { icon, label, detail, actionLabel } = suggestion.action;
    option.classList.add('search-suggestion-action');
    option.setAttribute('aria-label', `${actionLabel}: ${label}, ${detail}`);
    const iconElement = document.createElement('span');
    iconElement.className = 'suggestion-icon';
    iconElement.setAttribute('aria-hidden', 'true');
    iconElement.textContent = icon;
    const labelElement = document.createElement('span');
    labelElement.className = 'suggestion-label';
    labelElement.textContent = label;
    const detailElement = document.createElement('span');
    detailElement.className = 'suggestion-detail';
    detailElement.textContent = detail;
    option.append(iconElement, labelElement, detailElement);
}

/**
 * Attach autocomplete to a search field.
 * @param input - Search field (its parent must be positioned)
 * @param getNames - Unique item names to suggest from
 * @param getActions - Extra suggestions for the typed text, listed after the names
 * @returns Autocomplete handler
 */
export function createAutocomplete(
    input: HTMLInputElement,
    getNames: () => readonly string[],
    getActions: (query: string) => readonly ActionSuggestion[] = () => []
): Autocomplete {
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
    // The browser's own saved-entry dropdown would stack on top of ours
    input.setAttribute('autocomplete', 'off');

    let suggestions: readonly Suggestion[] = [];
    let highlighted = -1;
    let acceptedValue: string | undefined;

    function render(): void {
        list.replaceChildren(...suggestions.map((suggestion, index) => {
            const option = document.createElement('li');
            option.id = `${listId}-${instanceCount}-${index}`;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(index === highlighted));
            fillOption(suggestion, option);
            // mousedown (not click) so the field keeps focus
            option.addEventListener('mousedown', (event) => {
                event.preventDefault();
                accept(suggestion);
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
        const actions = getActions(value);
        // Actions take the last slots so they stay visible without scrolling
        const ranked = rankSuggestions(getNames(), value, Math.max(QUICK_SEARCH.MAX_SUGGESTIONS - actions.length, 1));
        // Nothing to add when the only name suggestion is exactly what was typed
        const names = ranked.length === 1 && ranked[0]?.toLowerCase() === value.trim().toLowerCase() ? [] : ranked;
        suggestions = [
            ...names.map((name): Suggestion => ({ kind: 'name', name })),
            ...actions.map((action): Suggestion => ({ kind: 'action', action })),
        ];
        highlighted = -1;
        render();
    }

    function accept(suggestion: Suggestion): void {
        if (suggestion.kind === 'action') {
            acceptedValue = '';
            input.value = '';
            close();
            suggestion.action.accept();
        } else {
            acceptedValue = suggestion.name;
            input.value = suggestion.name;
            close();
        }
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
