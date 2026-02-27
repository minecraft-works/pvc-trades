/**
 * Parser for ChatPatches mod chatlog.json files.
 *
 * ChatPatches (https://github.com/mrbuilder1961/ChatPatches) logs Minecraft
 * client chat as an array of Minecraft Raw JSON Text Components. Each message
 * uses a nested structure with `text`, `extra[]`, and `with[]` fields.
 *
 * This module extracts plain-text messages with timestamps and categorisation,
 * filtering out noise (AFK, deaths, advancements, empty messages).
 */

// ============================================================================
// Types
// ============================================================================

/** Discriminated union of parsed message categories. */
export type ChatMessageType = 'player_chat' | 'join' | 'leave' | 'same_ip';

/** A single parsed chat message with metadata. */
export interface ParsedChatMessage {
    /** Message category */
    readonly type: ChatMessageType;
    /** Epoch milliseconds extracted from the timestamp component */
    readonly epochMs: number;
    /** Display timestamp, e.g. `"[03:16:11]"` */
    readonly displayTime: string;
    /** Full plain-text content of the message (excludes timestamp) */
    readonly text: string;
    /** Player name when available (chat, join, leave, same_ip target) */
    readonly player: string | undefined;
    /** Chat message body (only for `player_chat`) */
    readonly message: string | undefined;
    /** Alt account names (only for `same_ip`, from the follow-up line) */
    readonly altNames: string | undefined;
}

/**
 * Minimal shape of a Minecraft Raw JSON Text Component.
 *
 * The real format is deeply recursive; we only type the fields we access.
 */
interface TextComponent {
    readonly text?: string;
    readonly extra?: readonly TextComponentOrString[];
    readonly with?: readonly TextComponentOrString[];
    readonly translate?: string;
    readonly color?: string;
    readonly insertion?: string;
    readonly click_event?: { readonly command?: string };
}

type TextComponentOrString = TextComponent | string;

/** Top-level shape of a ChatPatches chatlog.json file. */
interface ChatlogFile {
    readonly history?: readonly string[];
    readonly messages: readonly TextComponentOrString[];
}

// ============================================================================
// Text extraction
// ============================================================================

/** Chat message separator used by the PVC server's chat format. */
const CHAT_SEPARATOR = '›';

/**
 * Recursively extract plain text from a Minecraft text component tree.
 *
 * Handles all three nesting mechanisms:
 * - `text` — literal string at the current node
 * - `extra[]` — child components appended in order
 * - `with[]` — arguments for `translate` strings, also appended
 *
 * @param component - A text component node, a plain string, or undefined.
 * @returns The concatenated plain text.
 */
export function extractText(component: TextComponentOrString | undefined): string {
    if (component === undefined) {
        return '';
    }
    if (typeof component === 'string') {
        return component;
    }
    if (typeof component !== 'object') {
        return '';
    }

    let result = component.text ?? '';

    if (component.extra) {
        for (const child of component.extra) {
            result += extractText(child);
        }
    }

    if (component.with) {
        for (const argument of component.with) {
            result += extractText(argument);
        }
    }

    return result;
}

/**
 * Clean Unicode characters that don't display well in terminals.
 *
 * Removes common Minecraft decorative characters (hearts, special symbols)
 * and fixes encoding issues.
 *
 * @param text - The text to clean.
 * @returns Cleaned text with problematic characters removed.
 */
function cleanText(text: string): string {
    return text
        // Remove heart emojis and other decorative symbols
        .replaceAll('❤', '')
        .replaceAll('♥', '')
        // Remove various Unicode decorative characters
        .replaceAll(/[\u2600-\u26FF\u2700-\u27BF]/gu, '') // Miscellaneous symbols
        // Remove box-drawing characters (Unicode U+2500-257F)
        .replaceAll(/[\u2500-\u257F]/gu, '')
        // Remove other problematic characters
        .replaceAll(/[\u00AB\u00BB\u00BD\u02BB]/gu, '') // «, », ½, ʻ
        // Normalize whitespace (remove extra spaces from removed chars)
        .replaceAll(/\s{2,}/g, ' ')
        .trim();
}

// ============================================================================
// Message classification helpers
// ============================================================================

/**
 * Determine whether a content component is a player chat message.
 *
 * Player chat uses `translate: "%s"` with the full `playerName › message`
 * text inside `with[0]`.
 * @param content - The text component to inspect
 * @returns True if the component represents a player chat message
 */
function isPlayerChat(content: TextComponent): boolean {
    return content.translate === '%s';
}

/**
 * Leave messages use the vanilla `multiplayer.player.left` translation key.
 * @param content - The text component to inspect
 * @returns True if the component represents a leave message
 */
function isLeaveMessage(content: TextComponent): boolean {
    return content.translate === 'multiplayer.player.left';
}

/**
 * Join messages are plain "X joined the game" with no `translate` key.
 * @param plainText - The extracted plain text of the message
 * @param content - The text component to inspect
 * @returns True if the message describes a player joining the game
 */
function isJoinMessage(plainText: string, content: TextComponent): boolean {
    return content.translate === undefined && plainText.endsWith('joined the game');
}

/**
 * IP-warning messages start with "Warning:" and contain "same IP".
 * @param plainText - The extracted plain text of the message
 * @param content - The text component to inspect
 * @returns True if the message is a same-IP warning
 */
function isSameIpWarning(plainText: string, content: TextComponent): boolean {
    return content.translate === undefined && plainText.includes('same IP');
}

/**
 * Messages to exclude: AFK, deaths, advancements, empty.
 * @param plainText - The extracted plain text of the message
 * @param content - The text component to inspect
 * @returns True if the message should be filtered out
 */
function isExcluded(plainText: string, content: TextComponent): boolean {
    // Deaths
    if (content.translate?.startsWith('death.')) {
        return true;
    }
    // Advancements
    if (content.translate?.startsWith('chat.type.advancement')) {
        return true;
    }
    // AFK
    if (
        plainText.includes('is now AFK') ||
        plainText.includes('is back from AFK') ||
        plainText.startsWith('[AFK]')
    ) {
        return true;
    }

    return false;
}

// ============================================================================
// Timestamp extraction
// ============================================================================

interface TimestampInfo {
    readonly epochMs: number;
    readonly displayTime: string;
}

/**
 * Extract timestamp from the first component in `msg.extra[0]`.
 *
 * ChatPatches stores:
 * - `.text` — formatted display time, e.g. `"[03:16:11] "`
 * - `.insertion` — epoch milliseconds as a string
 * @param timestampComponent - The first extra element containing timestamp data
 * @returns Extracted epoch milliseconds and display time string
 */
function extractTimestamp(timestampComponent: TextComponentOrString | undefined): TimestampInfo {
    if (
        timestampComponent === undefined ||
        typeof timestampComponent === 'string'
    ) {
        return { epochMs: 0, displayTime: '' };
    }

    const displayTime = (timestampComponent.text ?? '').trim();
    const epochMs = Number(timestampComponent.insertion ?? '0');

    return { epochMs: Number.isFinite(epochMs) ? epochMs : 0, displayTime };
}

// ============================================================================
// Single-message parsing
// ============================================================================

/**
 * Parse a player chat message (`translate: "%s"`).
 *
 * The full text lives in `with[0]` and follows the pattern:
 * `"PlayerName › actual message text"`
 * @param content - Player chat text component with the message in `with[0]`
 * @param timestamp - Extracted timestamp info
 * @returns Parsed player chat message
 */
function parsePlayerChat(
    content: TextComponent,
    timestamp: TimestampInfo,
): ParsedChatMessage {
    const fullText = cleanText(extractText(content.with?.[0]).trim());
    const separatorIndex = fullText.indexOf(CHAT_SEPARATOR);

    let player: string;
    let message: string;

    if (separatorIndex === -1) {
        // Fallback: treat entire text as player name (shouldn't happen on PVC)
        player = fullText;
        message = '';
    } else {
        player = fullText.slice(0, separatorIndex).trim();
        message = fullText.slice(separatorIndex + CHAT_SEPARATOR.length).trim();
    }

    return {
        message,
        player,
        altNames: undefined,
        displayTime: timestamp.displayTime,
        epochMs: timestamp.epochMs,
        text: fullText,
        type: 'player_chat',
    };
}

/**
 * Parse a join message — plain text like `"PlayerName joined the game"`.
 * @param plainText - The full extracted plain text of the message
 * @param timestamp - Extracted timestamp info
 * @returns Parsed join message
 */
function parseJoinMessage(
    plainText: string,
    timestamp: TimestampInfo,
): ParsedChatMessage {
    // Extract player name by removing the fixed suffix
    const cleanedText = cleanText(plainText);
    const suffix = ' joined the game';
    const player = cleanedText.endsWith(suffix)
        ? cleanedText.slice(0, -suffix.length).trim()
        : cleanedText.trim();

    return {
        player,
        altNames: undefined,
        displayTime: timestamp.displayTime,
        epochMs: timestamp.epochMs,
        message: undefined,
        text: cleanedText,
        type: 'join',
    };
}

/**
 * Parse a leave message (`translate: "multiplayer.player.left"`).
 *
 * The player name is in `with[0]`.
 * @param content - Leave message text component with player name in `with[0]`
 * @param timestamp - Extracted timestamp info
 * @returns Parsed leave message
 */
function parseLeaveMessage(
    content: TextComponent,
    timestamp: TimestampInfo,
): ParsedChatMessage {
    const player = cleanText(extractText(content.with?.[0]).trim());

    return {
        player,
        altNames: undefined,
        displayTime: timestamp.displayTime,
        epochMs: timestamp.epochMs,
        message: undefined,
        text: `${player} left the game`,
        type: 'leave',
    };
}

/**
 * Parse a "same IP" warning.
 *
 * These come in pairs:
 * 1. `"Warning: .PlayerName has the same IP as the following players:"`
 * 2. `"AltName1, AltName2"` (the very next message in the array)
 *
 * @param plainText - The warning line text.
 * @param altNamesText - Plain text of the follow-up message listing alt names.
 * @param timestamp - Extracted timestamp info.
 * @returns Parsed same-IP warning message
 */
function parseSameIpMessage(
    plainText: string,
    altNamesText: string,
    timestamp: TimestampInfo,
): ParsedChatMessage {
    // Extract  player name from: "Warning: .PlayerName has the same IP …"
    // Use indexOf-based extraction instead of regex for safety
    const cleanedText = cleanText(plainText);
    const cleanedAltNames = cleanText(altNamesText);
    const warningPrefix = 'Warning: ';
    const ipSuffix = ' has the same IP';
    const prefixEnd = cleanedText.indexOf(warningPrefix);
    const suffixStart = cleanedText.indexOf(ipSuffix);
    const player = prefixEnd !== -1 && suffixStart !== -1
        ? cleanedText.slice(prefixEnd + warningPrefix.length, suffixStart).trim()
        : '';

    return {
        player,
        altNames: cleanedAltNames,
        displayTime: timestamp.displayTime,
        epochMs: timestamp.epochMs,
        message: undefined,
        text: cleanedText,
        type: 'same_ip',
    };
}

// ============================================================================
// Main parser
// ============================================================================

/**
 * Extract the content component from a raw message, or undefined if invalid.
 *
 * A valid message has `extra` with at least 2 elements where `extra[1]` is an object.
 * @param message - Raw message to extract components from
 * @returns Timestamp and content components, or undefined if the message is invalid
 */
function getContentComponent(message: TextComponentOrString): {
    readonly timestampComponent: TextComponentOrString;
    readonly contentComponent: TextComponent;
} | undefined {
    if (typeof message === 'string' || typeof message !== 'object') {
        return undefined;
    }
    const extras = message.extra;
    if (!extras || extras.length < 2) {
        return undefined;
    }
    const contentComponent = extras[1];
    if (typeof contentComponent === 'string' || typeof contentComponent !== 'object') {
        return undefined;
    }
    // extras[0] is safe: length >= 2 guarantees it exists
    const timestampComponent = extras[0];
    if (!timestampComponent) {
        return undefined;
    }
    return { timestampComponent, contentComponent };
}

/**
 * Look ahead to extract alt-names text from the message following an IP warning.
 * @param messages - Full message array from the chatlog
 * @param currentIndex - Index of the current IP warning message
 * @returns Alt-names text and whether the next message was consumed
 */
function extractAltNames(messages: readonly TextComponentOrString[], currentIndex: number): {
    readonly altNamesText: string;
    readonly consumed: boolean;
} {
    const nextMessage = messages[currentIndex + 1];
    if (nextMessage === undefined) {
        return { altNamesText: '', consumed: false };
    }
    const nextParts = getContentComponent(nextMessage);
    if (!nextParts) {
        return { altNamesText: '', consumed: false };
    }
    return {
        altNamesText: extractText(nextParts.contentComponent).trim(),
        consumed: true,
    };
}

/**
 * Classify a single content component and return a parsed message, or undefined to skip.
 * @param contentComponent - The content text component to classify
 * @param plainText - Plain text extracted from the content component
 * @param timestamp - Extracted timestamp info
 * @param messages - Full message array for look-ahead
 * @param index - Current message index
 * @returns Parsed message and skip count, or undefined if the message should be ignored
 */
function classifyMessage(
    contentComponent: TextComponent,
    plainText: string,
    timestamp: TimestampInfo,
    messages: readonly TextComponentOrString[],
    index: number,
): { readonly result: ParsedChatMessage; readonly skip: number } | undefined {
    if (isPlayerChat(contentComponent)) {
        return { result: parsePlayerChat(contentComponent, timestamp), skip: 0 };
    }
    if (isLeaveMessage(contentComponent)) {
        return { result: parseLeaveMessage(contentComponent, timestamp), skip: 0 };
    }
    if (isJoinMessage(plainText, contentComponent)) {
        return { result: parseJoinMessage(plainText, timestamp), skip: 0 };
    }
    if (isSameIpWarning(plainText, contentComponent)) {
        const { altNamesText, consumed } = extractAltNames(messages, index);
        return {
            result: parseSameIpMessage(plainText, altNamesText, timestamp),
            skip: consumed ? 1 : 0,
        };
    }
    return undefined;
}

/**
 * Process a single message from the chatlog.
 * @param message - Raw message component to process
 * @param messages - Full message array for look-ahead
 * @param index - Current message index
 * @returns The parsed message and number of messages to skip, or undefined if message should be ignored.
 */
function processMessage(
    message: TextComponentOrString,
    messages: readonly TextComponentOrString[],
    index: number,
): Readonly<{ result: ParsedChatMessage; skip: number }> | undefined {
    const parts = getContentComponent(message);
    if (!parts) {
        return undefined;
    }

    const { timestampComponent, contentComponent } = parts;
    const timestamp = extractTimestamp(timestampComponent);
    const plainText = extractText(contentComponent).trim();

    if (plainText.length === 0 || isExcluded(plainText, contentComponent)) {
        return undefined;
    }

    return classifyMessage(contentComponent, plainText, timestamp, messages, index);
}

/**
 * Parse a ChatPatches chatlog into an array of categorised plain-text messages.
 *
 * Includes: player chat, joins, leaves, same-IP warnings.
 * Excludes: AFK, deaths, advancements, empty/unrecognised messages.
 *
 * @param chatlog - The parsed chatlog.json object.
 * @returns Array of parsed messages in chronological order.
 */
export function parseChatlog(chatlog: ChatlogFile): readonly ParsedChatMessage[] {
    const results: ParsedChatMessage[] = [];
    const messages = chatlog.messages;
    let index = 0;

    while (index < messages.length) {
        const message = messages[index];
        if (message !== undefined) {
            const processed = processMessage(message, messages, index);
            if (processed) {
                results.push(processed.result);
                index += processed.skip;
            }
        }

        index++;
    }

    return results;
}
