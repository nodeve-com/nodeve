#!/usr/bin/env node
/**
 * Generate the committed lib-names index that `helper-collisions` matches local
 * helpers against (path from `helperCollisions.libNamesPath`).
 *
 * WHY committed + generated: resolving the libs HERE, not at check time, means
 * the commit gate has no runtime dependency on the libs being installed/
 * resolvable. Regenerate after dependency bumps so the index tracks new/removed
 * exports.
 *
 * Resolves each lib from the CWD's module graph; libs not installed are skipped
 * and logged. Run from the consumer repo root: `nodeve-build-lib-names`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { loadGate } from '../lib/bin.js';

const { root, cfg } = await loadGate('helperCollisions');
const output = join(root, cfg.libNamesPath);

const namesByLib: Record<string, string[]> = {};
const skipped: string[] = [];

for (const lib of cfg.libs) {
	try {
		const mod = (await import(lib)) as Record<string, unknown>;
		const fns = Object.keys(mod)
			.filter((k) => typeof mod[k] === 'function')
			.sort();
		if (fns.length) namesByLib[lib] = fns;
		else skipped.push(`${lib} (no function exports)`);
	} catch {
		skipped.push(lib);
	}
}

const out = {
	$generatedBy: 'nodeve-build-lib-names',
	libs: Object.keys(namesByLib),
	names: namesByLib,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(out, null, '\t') + '\n');

const total = Object.values(namesByLib).flat().length;
console.log(
	`Wrote ${total} names from ${Object.keys(namesByLib).join(', ') || '(none)'} to ${relative(root, output)}` +
		(skipped.length ? `\nSkipped (not installed): ${skipped.join(', ')}` : ''),
);
