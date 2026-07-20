// One-shot migration: fold the two ASSEMBLY maps into a single `archetype_settings:` block on every
// archetypes/ def, the class-level counterpart to `concept_settings:`:
//   - top-level `feature:`   → archetype_settings.feature_slots
//   - top-level `archetype:` → archetype_settings.archetype_slots
// WHY: they were the last def-language keys still floating at the document root, so the `archetype`
// meta-def could not declare them and kit/validate-docs.ts had to STRIP them — which meant 35 defs
// went unvalidated and a hand-authored allow-list (scripts/guard-archetype-features.ts) stood in for
// the gate. Nested under a feature only archetypes/archetype.yaml declares, "archetype-level only"
// holds by construction: `feature_slots` on a feature def is an undeclared key and the closed
// projection rejects it. See concepts/features/archetype_settings.yaml.
// Comment-preserving (yaml Document API — moves nodes, never re-serializes from scratch) and
// idempotent (a file already migrated is left untouched).
// Run: `node scripts/migrate-archetype-settings.ts`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Pair, type YAMLMap, isMap } from 'yaml';
import { readDocument, yamlFiles } from '../src/scribe/cascade.ts';
import { SRC_DIR } from '../src/concept-sources.ts';

// The AUTHORED tree — `CONCEPTS` points at the baked artifacts/database mirror, not the source.
const AUTHORED = join(SRC_DIR, '..', 'concepts');

const keyOf = (pair: Pair): string => (pair.key as { value?: unknown })?.value as string;
const findPair = (map: YAMLMap, key: string): Pair | undefined =>
	map.items.find((p) => keyOf(p as Pair) === key) as Pair | undefined;

/** Move a root pair into `settings` under `asKey`, preserving its own comments. */
function moveInto(options: { root: YAMLMap; settings: YAMLMap; pair: Pair; asKey: string }): void {
	const { root, settings, pair, asKey } = options;
	(pair.key as { value: string }).value = asKey;
	root.items.splice(root.items.indexOf(pair as (typeof root.items)[number]), 1);
	settings.items.push(pair as (typeof settings.items)[number]);
}

/** A blank line lifted from the root becomes a whitespace-only `commentBefore` once nested. */
function tidy(settings: YAMLMap): void {
	const clear = (n: { commentBefore?: string; spaceBefore?: boolean } | null | undefined): void => {
		if (!n) return;
		if (n.commentBefore !== undefined && n.commentBefore.trim() === '') n.commentBefore = undefined;
		if (n.spaceBefore) n.spaceBefore = false;
	};
	clear(settings as { commentBefore?: string });
	clear((settings.items[0] as Pair | undefined)?.key as { commentBefore?: string; spaceBefore?: boolean });
}

function migrate(path: string): boolean {
	const doc = readDocument(path);
	const root = doc.contents;
	if (!isMap(root)) return false;

	const feature = findPair(root, 'feature');
	const archetype = findPair(root, 'archetype');
	if (!feature && !archetype) return false;

	const legacy = [feature, archetype].filter((pair): pair is Pair => !!pair);
	const existing = findPair(root, 'archetype_settings');
	let settings: YAMLMap;
	if (existing && isMap(existing.value)) settings = existing.value;
	else {
		settings = doc.createNode({}) as YAMLMap;
		const pair = doc.createPair('archetype_settings', settings) as unknown as (typeof root.items)[number];
		root.items.splice(root.items.indexOf(legacy[0] as (typeof root.items)[number]), 0, pair);
	}

	// Order matters for readability: features first, then the nested sibling classes.
	if (feature) moveInto({ root, settings, pair: feature, asKey: 'feature_slots' });
	if (archetype) moveInto({ root, settings, pair: archetype, asKey: 'archetype_slots' });
	tidy(settings);

	writeFileSync(path, doc.toString());
	return true;
}

const migrated: string[] = [];
for (const path of yamlFiles(join(AUTHORED, 'archetypes'))) {
	if (migrate(path)) migrated.push(path.slice(AUTHORED.length + 1));
}

console.log(`migrated ${migrated.length} file(s):`);
for (const rel of migrated.sort()) console.log(`  ${rel}`);
