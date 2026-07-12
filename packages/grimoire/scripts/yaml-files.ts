// Shared by the concept guards (guard-archetype-features, guard-feature-props): a recursive YAML
// walk that skips the cascade/doc sidecars a guard never inspects.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const IGNORE = new Set(['_defaults.yaml', '_default.yaml', 'README.md', 'CLAUDE.md']);

/** Every `.yaml` under `dir`, recursively, as absolute paths. */
export function yamlFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...yamlFiles(p));
		else if (name.endsWith('.yaml') && !IGNORE.has(name)) out.push(p);
	}
	return out;
}
