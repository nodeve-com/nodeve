#!/usr/bin/env node
import { shortCode } from './short-code.js';

/**
 * CLI wrapper for {@link shortCode}.
 *
 * Each command-line argument is treated as a separate input and its short-code
 * is printed on its own line. With no arguments, input is read from stdin
 * (whole stream hashed as one value), making it pipe-friendly:
 *
 *   short-code 'https://example.com'
 *   echo -n 'https://example.com' | short-code
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length > 0) {
		for (const arg of args) process.stdout.write(`${shortCode(arg)}\n`);
		return;
	}

	const chunks: Uint8Array[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
	}
	process.stdout.write(`${shortCode(Buffer.concat(chunks))}\n`);
}

main().catch((err) => {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
	process.exitCode = 1;
});
