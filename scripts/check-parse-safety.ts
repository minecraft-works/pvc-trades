/**
 * Checks that production code uses .safeParse() instead of .parse().
 * Scans src/ directory for Zod .parse() calls, excluding test files.
 * Exit code 1 if unsafe .parse() calls found.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

function walkDirectory(directory: string, results: string[] = []): string[] {
    for (const entry of readdirSync(directory)) {
        const fullPath = join(directory, entry);
        if (statSync(fullPath).isDirectory() && !entry.includes('node_modules')) {
            walkDirectory(fullPath, results);
        } else if (extname(fullPath) === '.ts' && !fullPath.includes('.test.')) {
            results.push(fullPath);
        }
    }
    return results;
}

const files = walkDirectory('src');
let found = false;

for (const filePath of files) {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
        if (line.includes('.parse(') && !line.includes('.safeParse(') && !line.includes('JSON.parse(') && !line.includes('// parse-safety-ignore')) {
            console.error(`${filePath}:${String(index + 1)}: ${line.trim()}`);
            found = true;
        }
    }
}

if (found) {
    console.error('\n.parse() found in production code — use .safeParse() instead');
    process.exit(1);
} else {
    console.log('No unsafe .parse() calls found');
}
