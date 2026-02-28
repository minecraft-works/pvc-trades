/**
 * CLI script to parse chatlog.json and print summary + messages.
 *
 * Usage: npx tsx src/chatlog/run-parser.ts [path-to-chatlog.json]
 * Default: src/chatlog.json
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseChatlog } from './chatlog-parser.js';

const filePath = path.resolve(process.argv[2] ?? 'src/chatlog.json');
const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
const results = parseChatlog(raw as any);

// Summary
const counts: Map<string, number> = new Map();
for (const message of results) {
    counts.set(message.type, (counts.get(message.type) ?? 0) + 1);
}

console.log(`\n=== Parsed ${results.length} messages from ${filePath} ===`);
for (const [type, count] of [...counts.entries()].toSorted((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${type}: ${count}`);
}
console.log('');

// Print messages
for (const message of results) {
    const time = message.displayTime;
    switch (message.type) {
        case 'player_chat': {
            console.log(`${time} [CHAT] ${message.player} > ${message.message}`);
            break;
        }
        case 'join': {
            console.log(`${time} [JOIN] ${message.player}`);
            break;
        }
        case 'leave': {
            console.log(`${time} [LEAVE] ${message.player}`);
            break;
        }
        case 'same_ip': {
            console.log(`${time} [SAME_IP] ${message.player} => alts: ${message.altNames}`);
            break;
        }
    }
}
