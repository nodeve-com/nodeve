// Drift gate: nodeve.yaml's prefixes block is DERIVED from data/registry rows
// (src/prefixes.ts). A hand-edit or a stale block silently diverges from the
// registry, so precommit re-derives and compares. Exit 1 on drift — the fix is
// always `pnpm generate`. The prefix-map twin of check:catalog.
import { abs, readYaml } from '../src/io.ts';
import { derivePrefixes } from '../src/prefixes.ts';

const want = derivePrefixes();
const have = readYaml<{ prefixes?: Record<string, string> }>(abs('linkml/nodeve.yaml')).prefixes ?? {};

const drift = [...new Set([...Object.keys(want), ...Object.keys(have)])]
	.sort()
	.filter((k) => want[k] !== have[k]);

if (drift.length) {
	for (const k of drift)
		console.error(`prefix ${k}: registry=${want[k] ?? '(absent)'} schema=${have[k] ?? '(absent)'}`);
	console.error(`\n${drift.length} prefix(es) drift from data/registry — run: pnpm generate`);
	process.exit(1);
}
console.log(`${Object.keys(want).length} prefixes match data/registry`);
