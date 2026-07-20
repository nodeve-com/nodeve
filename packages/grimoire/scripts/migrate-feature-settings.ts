// One-shot migration: fold the FEATURE-only def-language keys off the document root into the
// `feature_settings:` block, so the `feature` meta-def can DECLARE its own grammar:
//   features/  `prop:`  → feature_settings.prop
//   features/  `enums:` → feature_settings.enums
// The archetype half of this move is scripts/migrate-archetype-settings.ts (same shape, run first).
// WHY: these were the def-language keys still floating at the root, which no meta-def could declare
// — so kit/validate-docs.ts STRIPPED them, and a stripped key is an unvalidated key. That is how 35
// archetype defs went unchecked behind a hand-authored allow-list (the deleted
// scripts/guard-archetype-features.ts), and why every key that had to be REJECTED needed its own
// exception in the filter. Nested under a block only one meta-def declares, layer-locality holds by
// construction: `prop` on an archetype and `feature_slots` on a feature are both undeclared keys,
// and the closed projection rejects an undeclared key. The filter then deletes entirely.
//   concept_settings   — shared grammar (compose / repeated / part / array / map / count)
//   feature_settings   — feature-only  (prop / enums)
//   archetype_settings — archetype-only (feature_slots / archetype_slots)
// Comment-preserving (yaml Document API — moves nodes, never re-serializes from scratch) and
// idempotent (a file already migrated is left untouched).
// Run: `node scripts/migrate-settings-blocks.ts`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Pair, type YAMLMap, isMap } from 'yaml';
import { readDocument, yamlFiles } from '../src/scribe/cascade.ts';
import { SRC_DIR } from '../src/concept-sources.ts';

// The AUTHORED tree — `CONCEPTS` points at the baked artifacts/database mirror, not the source.
const AUTHORED = join(SRC_DIR, '..', 'concepts');

/** The settings block to fold into, and the root key → nested key moves. */
const PLANS = [
	{ dir: 'features', block: 'feature_settings', moves: { prop: 'prop', enums: 'enums' } },
] as const;

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

function migrate(path: string, plan: (typeof PLANS)[number]): boolean {
	const doc = readDocument(path);
	const root = doc.contents;
	if (!isMap(root)) return false;

	const found: Array<{ pair: Pair; to: string }> = [];
	for (const [from, to] of Object.entries(plan.moves)) {
		const pair = findPair(root, from);
		if (pair) found.push({ pair, to });
	}
	if (found.length === 0) return false;

	const existing = findPair(root, plan.block);
	let settings: YAMLMap;
	if (existing && isMap(existing.value)) settings = existing.value;
	else {
		settings = doc.createNode({}) as YAMLMap;
		const pair = doc.createPair(plan.block, settings) as unknown as (typeof root.items)[number];
		const anchor = found[0]!.pair as (typeof root.items)[number];
		root.items.splice(root.items.indexOf(anchor), 0, pair);
	}

	for (const { pair, to } of found) moveInto({ root, settings, pair, asKey: to });
	tidy(settings);

	writeFileSync(path, doc.toString());
	return true;
}

const migrated: string[] = [];
for (const plan of PLANS) {
	for (const path of yamlFiles(join(AUTHORED, plan.dir))) {
		if (migrate(path, plan)) migrated.push(path.slice(AUTHORED.length + 1));
	}
}

console.log(`migrated ${migrated.length} file(s):`);
for (const rel of migrated.sort()) console.log(`  ${rel}`);
