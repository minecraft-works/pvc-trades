import { describe, expect, test } from 'vitest';

import { extractText, parseChatlog } from './chatlog-parser.js';

// ============================================================================
// Helpers — build Minecraft text components matching ChatPatches format
// ============================================================================

/** Build a timestamp component like ChatPatches stores in `extra[0]`. */
function makeTimestamp(displayTime: string, epochMs: number) {
    return {
        text: displayTime,
        insertion: String(epochMs),
        click_event: { command: '2025-01-21' },
    };
}

/** Wrap a content component in the full ChatPatches message envelope. */
function makeMessage(content: Record<string, unknown>, epochMs = 1_000_000) {
    return {
        text: '',
        extra: [
            makeTimestamp('[12:00:00] ', epochMs),
            content,
            '',
        ],
    };
}

/** Build a player chat message with `translate: "%s"`. */
function makePlayerChat(player: string, message: string, epochMs = 1_000_000) {
    return makeMessage({
        translate: '%s',
        with: [
            {
                text: '',
                extra: [
                    { text: '', extra: [{ text: `${player} › ${message}` }] },
                ],
            },
        ],
    }, epochMs);
}

/** Build a join message (plain text, no translate key). */
function makeJoinMessage(player: string, epochMs = 1_000_000) {
    return makeMessage({ color: 'yellow', text: `${player} joined the game` }, epochMs);
}

/** Build a leave message with `translate: "multiplayer.player.left"`. */
function makeLeaveMessage(player: string, epochMs = 1_000_000) {
    return makeMessage({
        translate: 'multiplayer.player.left',
        with: [{ text: player }],
    }, epochMs);
}

/** Build a death message. */
function makeDeathMessage(player: string, epochMs = 1_000_000) {
    return makeMessage({
        translate: 'death.attack.mob',
        with: [{ text: player }, { text: 'Zombie' }],
    }, epochMs);
}

/** Build an advancement message. */
function makeAdvancementMessage(player: string, advancement: string, epochMs = 1_000_000) {
    return makeMessage({
        translate: 'chat.type.advancement.task',
        with: [{ text: player }, { text: advancement }],
    }, epochMs);
}

/** Build an AFK message. */
function makeAfkMessage(text: string, epochMs = 1_000_000): ReturnType<typeof makeMessage> {
    return makeMessage({ text: '', extra: [{ text }] }, epochMs);
}

/** Build a same-IP warning + alt-names pair. */
function makeSameIpPair(player: string, altNames: string, epochMs = 1_000_000) {
    return [
        makeMessage(
            { text: '', extra: [{ text: `Warning: ${player} has the same IP as the following players:` }] },
            epochMs,
        ),
        makeMessage(
            { text: altNames },
            epochMs + 1,
        ),
    ];
}

// ============================================================================
// extractText
// ============================================================================

describe('extractText', () => {
    test('returns empty string for undefined', () => {
        expect(extractText()).toBe('');
    });

    test('returns plain string as-is', () => {
        expect(extractText('hello world')).toBe('hello world');
    });

    test('returns text field from simple component', () => {
        expect(extractText({ text: 'hello' })).toBe('hello');
    });

    test('concatenates text + extra children', () => {
        const component = {
            text: 'A',
            extra: [{ text: 'B' }, { text: 'C' }],
        };
        expect(extractText(component)).toBe('ABC');
    });

    test('concatenates text + with arguments', () => {
        const component = {
            text: '',
            translate: '%s',
            with: [{ text: 'player' }, { text: ' message' }],
        };
        expect(extractText(component)).toBe('player message');
    });

    test('handles deeply nested components', () => {
        const component = {
            text: '',
            extra: [
                {
                    text: '',
                    extra: [
                        { text: 'deep', extra: [{ text: ' value' }] },
                    ],
                },
            ],
        };
        expect(extractText(component)).toBe('deep value');
    });

    test('handles mixed extra and with', () => {
        const component = {
            text: 'root-',
            extra: [{ text: 'extra' }],
            with: [{ text: '-with' }],
        };
        expect(extractText(component)).toBe('root-extra-with');
    });

    test('handles string children in extra array', () => {
        const component = {
            text: 'A',
            extra: ['B', 'C'],
        };
        expect(extractText(component)).toBe('ABC');
    });
});

// ============================================================================
// parseChatlog — player chat
// ============================================================================

describe('parseChatlog — player chat', () => {
    test('parses player chat with separator', () => {
        const chatlog = { messages: [makePlayerChat('Steve', 'hello world', 1_700_000_000_000)] };
        const results = parseChatlog(chatlog);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'player_chat',
            epochMs: 1_700_000_000_000,
            displayTime: '[12:00:00]',
            player: 'Steve',
            message: 'hello world',
        });
    });

    test('handles player name with rank prefix', () => {
        const chatlog = { messages: [makePlayerChat('Lord [REU] ❤ Notchian', 'hi')] };
        const results = parseChatlog(chatlog);

        expect(results[0].player).toBe('Lord [REU] Notchian');
        expect(results[0].message).toBe('hi');
    });

    test('preserves full text field', () => {
        const chatlog = { messages: [makePlayerChat('Alex', 'test message')] };
        const results = parseChatlog(chatlog);

        expect(results[0].text).toBe('Alex › test message');
    });
});

// ============================================================================
// parseChatlog — join / leave
// ============================================================================

describe('parseChatlog — join and leave', () => {
    test('parses join message', () => {
        const chatlog = { messages: [makeJoinMessage('Steve', 1_700_000_000_100)] };
        const results = parseChatlog(chatlog);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'join',
            player: 'Steve',
            text: 'Steve joined the game',
            epochMs: 1_700_000_000_100,
        });
    });

    test('parses leave message', () => {
        const chatlog = { messages: [makeLeaveMessage('Alex', 1_700_000_000_200)] };
        const results = parseChatlog(chatlog);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'leave',
            player: 'Alex',
            text: 'Alex left the game',
        });
    });

    test('handles player name with dot prefix on join', () => {
        const chatlog = { messages: [makeJoinMessage('.DotPlayer99')] };
        const results = parseChatlog(chatlog);

        expect(results[0].player).toBe('.DotPlayer99');
    });
});

// ============================================================================
// parseChatlog — same IP warning
// ============================================================================

describe('parseChatlog — same IP warning', () => {
    test('parses IP warning with alt names from next message', () => {
        const [warning, alts] = makeSameIpPair('.BlockMiner', 'BlockMiner_Alt', 1_700_000_000_300);
        const chatlog = { messages: [warning, alts] };
        const results = parseChatlog(chatlog);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'same_ip',
            player: '.BlockMiner',
            altNames: 'BlockMiner_Alt',
        });
    });

    test('parses IP warning with multiple alt names', () => {
        const [warning, alts] = makeSameIpPair('.CreeperKing', '.AltAccount1, .AltAccount2');
        const chatlog = { messages: [warning, alts] };
        const results = parseChatlog(chatlog);

        expect(results[0].altNames).toBe('.AltAccount1, .AltAccount2');
    });

    test('skips the alt-names follow-up line (no duplicate entry)', () => {
        const [warning, alts] = makeSameIpPair('TestUser', 'AltUser');
        const nextChat = makePlayerChat('Steve', 'hello');
        const chatlog = { messages: [warning, alts, nextChat] };
        const results = parseChatlog(chatlog);

        expect(results).toHaveLength(2);
        expect(results[0].type).toBe('same_ip');
        expect(results[1].type).toBe('player_chat');
    });

    test('handles IP warning at end of messages array', () => {
        const [warning] = makeSameIpPair('TestUser', 'ignored');
        const chatlog = { messages: [warning] };
        const results = parseChatlog(chatlog);

        expect(results).toHaveLength(1);
        expect(results[0].altNames).toBe('');
    });
});

// ============================================================================
// parseChatlog — excluded message types
// ============================================================================

describe('parseChatlog — exclusions', () => {
    test('excludes death messages', () => {
        const chatlog = { messages: [makeDeathMessage('Steve')] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });

    test('excludes advancement messages', () => {
        const chatlog = { messages: [makeAdvancementMessage('Steve', 'Getting Wood')] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });

    test('excludes "is now AFK" messages', () => {
        const chatlog = { messages: [makeAfkMessage('Steve is now AFK')] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });

    test('excludes "is back from AFK" messages', () => {
        const chatlog = { messages: [makeAfkMessage('Steve is back from AFK')] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });

    test('excludes "[AFK]" prefixed messages', () => {
        const chatlog = { messages: [makeAfkMessage('[AFK] You can stay inactive…')] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });

    test('excludes messages with no content component', () => {
        const chatlog = { messages: [{ text: '', extra: [makeTimestamp('[12:00:00] ', 1000)] }] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });

    test('excludes messages with empty plain text', () => {
        const chatlog = { messages: [makeMessage({ text: '' })] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });

    test('excludes unrecognised system messages', () => {
        const chatlog = { messages: [makeMessage({ text: 'SomePlayer has been playing for 4 hours' })] };
        expect(parseChatlog(chatlog)).toHaveLength(0);
    });
});

// ============================================================================
// parseChatlog — mixed messages
// ============================================================================

describe('parseChatlog — mixed messages', () => {
    test('parses mixed message types in order', () => {
        const chatlog = {
            messages: [
                makePlayerChat('Steve', 'hello', 1000),
                makeJoinMessage('Alex', 2000),
                makeDeathMessage('Creeper', 3000),           // excluded
                makeAfkMessage('Steve is now AFK', 4000),    // excluded
                makeLeaveMessage('Alex', 5000),
                ...makeSameIpPair('.TestUser', 'AltTest', 6000),
                makeAdvancementMessage('Steve', 'Wood', 7000), // excluded
                makePlayerChat('Alex', 'goodbye', 8000),
            ],
        };

        const results = parseChatlog(chatlog);

        expect(results).toHaveLength(5);
        expect(results.map(r => r.type)).toEqual([
            'player_chat',
            'join',
            'leave',
            'same_ip',
            'player_chat',
        ]);
    });

    test('returns empty array for empty messages', () => {
        expect(parseChatlog({ messages: [] })).toEqual([]);
    });

    test('chronological order is preserved', () => {
        const chatlog = {
            messages: [
                makePlayerChat('A', 'first', 1000),
                makePlayerChat('B', 'second', 2000),
                makePlayerChat('C', 'third', 3000),
            ],
        };

        const results = parseChatlog(chatlog);
        expect(results.map(r => r.epochMs)).toEqual([1000, 2000, 3000]);
    });

    test('undefined fields are set correctly per type', () => {
        const chatlog = {
            messages: [
                makePlayerChat('Steve', 'hi', 1000),
                makeJoinMessage('Alex', 2000),
                makeLeaveMessage('Alex', 3000),
            ],
        };

        const results = parseChatlog(chatlog);

        // player_chat has message, no altNames
        expect(results[0].message).toBe('hi');
        expect(results[0].altNames).toBeUndefined();

        // join has no message, no altNames
        expect(results[1].message).toBeUndefined();
        expect(results[1].altNames).toBeUndefined();

        // leave has no message, no altNames
        expect(results[2].message).toBeUndefined();
        expect(results[2].altNames).toBeUndefined();
    });
});
