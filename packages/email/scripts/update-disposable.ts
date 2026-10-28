/**
 * Refresh the disposable email domain blocklist.
 *
 * Fetches the canonical list from the `disposable-email-domains`
 * GitHub repo, normalizes it (lowercase, trimmed, deduped, sorted),
 * and writes it to `src/disposable.json` as a tab-indented
 * JSON array.
 *
 * Usage:
 *   pnpm --filter @nodeve/email update:disposable
 *
 * The JSON is checked in so production builds don't need network
 * access at install or build time.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SOURCE_URL =
	'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/refs/heads/main/disposable_email_blocklist.conf';

const DISPOSABLE_JSON_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../src/disposable.json',
);

console.log(`Fetching ${SOURCE_URL}`);
const response = await fetch(SOURCE_URL);
if (!response.ok) {
	throw new Error(`Failed to fetch disposable list: ${response.status} ${response.statusText}`);
}
const domains = [
	...new Set(
		(await response.text())
			.split('\n')
			.map((line) => line.trim().toLowerCase())
			.filter((line) => line.length > 0 && !line.startsWith('#')),
	),
].sort();
await writeFile(DISPOSABLE_JSON_PATH, JSON.stringify(domains, null, '\t') + '\n', 'utf8');
console.log(`Wrote ${domains.length} domains to ${DISPOSABLE_JSON_PATH}`);
