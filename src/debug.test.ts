import { describe, expect, test } from 'vitest';

import { isNamespaceEnabled } from './debug.js';

describe('isNamespaceEnabled', () => {
    test('matches wildcards and exact names', () => {
        expect(isNamespaceEnabled('app:tiles', 'app:*')).toBe(true);
        expect(isNamespaceEnabled('app:tiles', 'app:map, app:tiles')).toBe(true);
        expect(isNamespaceEnabled('app:tiles', 'app:map')).toBe(false);
    });

    test('is off without a setting', () => {
        expect(isNamespaceEnabled('app:tiles', '')).toBe(false);
    });

    test('exclusions win over wildcards', () => {
        expect(isNamespaceEnabled('app:tiles', 'app:*,-app:tiles')).toBe(false);
        expect(isNamespaceEnabled('app:map', 'app:*,-app:tiles')).toBe(true);
    });
});
