// One-shot migration: fold the def-language grammar (`compose` / `repeated` / `part` / `array` /
// `map`) into a single `concept_settings:` block on every features/ + archetypes/ def, replacing
// the old scattered form:
//   - top-level `compose:` (list)          → concept_settings.compose
//   - top-level `repeated:` / `part:`      → concept_settings.repeated / .part
//   - `feature_settings: {alias, …}`       → concept_settings: {compose, …}   (alias IS a compose)
// Comment-preserving (yaml Document API — moves nodes, never re-serializes from scratch) and
// idempotent (a file already migrated is left untouched). Reusable: re-run after adding files.
// Run: `node scripts/migrate-concept-settings.ts`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Pair, type YAMLMap, isMap, parseDocument } from 'yaml';
import { CONCEPTS, yamlFiles } from '../src/concept-sources.ts';

const DIRS = ['features', 'archetypes'];

const keyOf = (pair: Pair): string => (pair.key as { value?: unknown })?.value as string;
const findPair = (map: YAMLMap, key: string): Pair | undefined =>
	map.items.find((p) => keyOf(p as Pair) === key) as Pair | undefined;

/** Move a top-level `pair` into `settings` under `asKey` (renaming its key), removing it from the
 *  document root. Preserves the pair's own comments; only the key scalar is renamed. */

function moveInto(options: { root: YAMLMap; settings: YAMLMap; pair: Pair; asKey: string }): void {
	const { root, settings, pair, asKey } = options;
	(pair.key as { value: string }).value = asKey;
	root.items.splice(root.items.indexOf(pair), 1);
	settings.items.push(pair as (typeof settings.items)[number]);
}

/** A blank line lifted from the document root becomes a whitespace-only `commentBefore` once
 *  nested — an indented empty line. Drop those; keep real comments. */
function tidy(settings: YAMLMap): void {
	const clear = (n: { commentBefore?: string; spaceBefore?: boolean } | null | undefined): void => {
		if (!n) return;
		if (n.commentBefore !== undefined && n.commentBefore.trim() === '') n.commentBefore = undefined;
		if (n.spaceBefore) n.spaceBefore = false;
	};
	const first = settings.items[0] as Pair | undefined;
	clear(settings as { commentBefore?: string });
	clear(first?.key as { commentBefore?: string; spaceBefore?: boolean });
}

let changed = 0;
const migrated: string[] = [];

function tidyExisting(
	doc: ReturnType<typeof parseDocument>,
	path: string,
	existing: Pair | undefined,
) {
	if (!existing || !isMap(existing.value)) return false;
	const before = doc.toString();
	tidy(existing.value);
	if (doc.toString() === before) return false;
	writeFileSync(path, doc.toString());
	return true;
}

function settingsMap(options: {
	doc: ReturnType<typeof parseDocument>;
	root: YAMLMap;
	path: string;
	featureSettings: Pair | undefined;
	legacy: Pair[];
}): YAMLMap {
	const { doc, root, path, featureSettings, legacy } = options;
	if (!featureSettings || !isMap(featureSettings.value)) {
		const settings = doc.createNode({}) as YAMLMap;
		const pair = doc.createPair(
			'concept_settings',
			settings,
		) as unknown as (typeof root.items)[number];
		root.items.splice(root.items.indexOf(legacy[0] as (typeof root.items)[number]), 0, pair);
		return settings;
	}
	(featureSettings.key as { value: string }).value = 'concept_settings';
	const settings = featureSettings.value;
	const alias = findPair(settings, 'alias');
	if (alias && legacy.some((pair) => keyOf(pair) === 'compose'))
		throw new Error(
			`${path}: has both feature_settings.alias and top-level compose — reconcile by hand`,
		);
	if (alias) (alias.key as { value: string }).value = 'compose';
	return settings;
}

function migrate(path: string): boolean {
	const doc = parseDocument(readFileSync(path, 'utf8'));
	const root = doc.contents;
	if (!isMap(root)) return false;

	const fs = findPair(root, 'feature_settings');
	const topCompose = findPair(root, 'compose');
	const topRepeated = findPair(root, 'repeated');
	const topPart = findPair(root, 'part');
	const existing = findPair(root, 'concept_settings');
	if (!fs && !topCompose && !topRepeated && !topPart) {
		return tidyExisting(doc, path, existing);
	}

	const legacy = [topCompose, topRepeated, topPart].filter((pair): pair is Pair => !!pair);
	const settings = settingsMap({ doc, root, path, featureSettings: fs, legacy });

	if (topCompose) moveInto({ root, settings, pair: topCompose, asKey: 'compose' });
	if (topRepeated) moveInto({ root, settings, pair: topRepeated, asKey: 'repeated' });
	if (topPart) moveInto({ root, settings, pair: topPart, asKey: 'part' });
	tidy(settings);

	writeFileSync(path, doc.toString());
	return true;
}

for (const dir of DIRS) {
	for (const path of yamlFiles(join(CONCEPTS, dir))) {
		if (!migrate(path)) continue;
		changed++;
		migrated.push(path.slice(CONCEPTS.length + 1));
	}
}

console.log(`migrated ${changed} file(s):`);
for (const rel of migrated.sort()) console.log(`  ${rel}`);
