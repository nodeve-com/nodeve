// Guard: every grimoire concept name is DEFINED ONCE across concepts/.
//
// The concepts/ tree is mid-migration from TypeScript defs to the vocab-backed YAML model. A concept
// name (a file's stem) must resolve to exactly ONE file. Two files sharing a stem are ambiguous —
// consumers can't tell which is canonical, and the two can silently drift. This shows up two ways,
// both flagged here:
//   - same stem, different format:  archetypes/inverter.ts + archetypes/inverter.yaml  (half-migrated)
//   - same stem in two directories: features/refs.yaml + features/vocab/refs.yaml          (name reused)
//
// Companion files (`condition.refs.ts`, `numeric_decode.lang.ts`) carry distinct stems and don't
// collide. Run standalone any time: `node scripts/guard-concept-dupes.ts`.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const CONCEPTS_DIR = join(import.meta.dirname, '../concepts');

/** Every `.ts`/`.yaml` file under concepts/, as [stem, path] pairs. */
function* walk(dir: string): Generator<{ stem: string; path: string }> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(path);
		} else if (entry.name.endsWith('.ts') || entry.name.endsWith('.yaml')) {
			const ext = entry.name.endsWith('.yaml') ? '.yaml' : '.ts';
			yield { stem: entry.name.slice(0, -ext.length), path };
		}
	}
}

// Deeply-nested feature variants (`features/<group>/<family>/*`) share stems by design — the
// family dir disambiguates them (e.g. `ac_phase_three/point.yaml` vs another family's `point.yaml`).
// Skip anything two directory levels deep under `features/`.
function isDeepFeatureVariant(rel: string): boolean {
	const parts = rel.split('/');
	return parts[0] === 'features' && parts.length > 3;
}

// Key each concept by its stem; collect every file claiming that name.
const pathsByStem = new Map<string, string[]>();
for (const { stem, path } of walk(CONCEPTS_DIR)) {
	const rel = relative(CONCEPTS_DIR, path);
	if (isDeepFeatureVariant(rel)) continue;
	// `_defaults.yaml` is a cascade file, not a concept — one legitimately sits in
	// many directories, each scoped to its own subtree. Never a name collision.
	if (stem === '_defaults') continue;
	(pathsByStem.get(stem) ?? pathsByStem.set(stem, []).get(stem)!).push(rel);
}

const dups = [...pathsByStem.entries()]
	.filter(([, paths]) => paths.length > 1)
	.map(([stem, paths]) => [stem, paths.sort()] as const)
	.sort(([a], [b]) => a.localeCompare(b));

if (dups.length === 0) {
	process.exit(0);
}

console.error(`\n✖ grimoire concept name(s) defined in more than one file:\n`);
for (const [stem, paths] of dups) {
	console.error(`  ${stem}  —  ${paths.join(', ')}`);
}
console.error(`
A concept name must resolve to a single file. Finish any TS→YAML migration by deleting the stale
.ts once its .yaml lands, and give distinct concepts distinct names instead of reusing a stem in
two directories — one source of truth per name.
`);
process.exit(1);
