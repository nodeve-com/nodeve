// Source indexes for the concept layers (property|features|archetypes|parts) — the file-walking
// half of the schema compiler (kit/compile.ts holds the composition). Reads the SCRIBED JSON
// database (artifacts/database/), NOT the raw YAML: scribe already folded the `_defaults.yaml`
// cascade and stamped identity, so everything here works against desugared JSON. The only YAML
// reader in grimoire is scribe/. BUILD- AND TEST-ONLY: imports `fs`; nothing on the runtime path
// may import it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPlainObject } from 'remeda';

export type Obj = Record<string, unknown>;

/** `src/` — the runtime TS surface (glue over the generated projection). */
export const SRC_DIR = import.meta.dirname;

/** The scribed JSON database — the desugared concept tree (`_defaults` folded, identity stamped)
 *  scribe emits from `concepts/`. Every generator/guard reads THIS, not the raw YAML; `CONCEPTS`
 *  keeps its name (the conceptual root) but points at the JSON mirror. `pnpm scribe` builds it. */
export const CONCEPTS = join(SRC_DIR, '..', 'artifacts', 'database');
export const PROPERTY_DIR = join(CONCEPTS, 'property');
export const ENUMERATION_DIR = join(CONCEPTS, 'enumeration');
export const FEATURES_DIR = join(CONCEPTS, 'features');
export const ARCHETYPES_DIR = join(CONCEPTS, 'archetypes');
export const CATALOG_DIR = join(CONCEPTS, 'catalog');

/** The `artifacts/` JSON output tree and its baked catalog — what JSON readers (and the guards)
 *  read; `pnpm generate` emits it. Distinct from `CATALOG_DIR` above, the YAML SOURCE catalog. */
export const ARTIFACTS_DIR = join(SRC_DIR, '..', 'artifacts');
export const ARTIFACTS_CATALOG_DIR = join(ARTIFACTS_DIR, 'catalog');

/** The committed generated-TS output tree (`src/generated/`) — the twin root `pnpm generate` emits
 *  beside `artifacts/`; the guards sweep it. */
export const GENERATED_DIR = join(SRC_DIR, 'generated');

/** Every `.json` under `dir` recursively (absolute paths). The database holds no cascade files
 *  (scribe consumed the `_defaults.yaml`), so there is nothing to skip. */
export function jsonFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
		else if (name.endsWith('.json')) out.push(p);
	}
	return out;
}

/** Every `.ts` under `root`, recursively, as paths relative to `root` (sorted) — the file-walking
 *  half every `.ts`-sweeping guard shares. `skip(path)` prunes a subtree (e.g. `src/generated` when
 *  sweeping the runtime surface). */
export function tsFiles(root: string, skip: (path: string) => boolean = () => false): string[] {
	const walk = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			if (skip(path)) return [];
			if (statSync(path).isDirectory()) return walk(path);
			return path.endsWith('.ts') ? [relative(root, path)] : [];
		});
	return walk(root).sort();
}

/** Read one scribed database doc — the desugared JSON a source `.yaml` became. THE single load
 *  surface downstream of scribe (empty → `{}`). */
export const readJson = (path: string): Obj => (JSON.parse(readFileSync(path, 'utf8')) ?? {}) as Obj;

/** slug → file path for one concept layer dir; slugs are file stems, unique per layer. */
function indexLayer(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const path of jsonFiles(join(CONCEPTS, dir))) {
		const slug = path.split('/').pop()!.slice(0, -'.json'.length);
		const prior = out.get(slug);
		if (prior)
			throw new Error(
				`grimoire compile: ${dir}/ has two files for slug "${slug}" (${prior}, ${path})`,
			);
		out.set(slug, path);
	}
	return out;
}

const indexByLayer = new Map<string, Map<string, string>>();
export const layerIndex = (dir: string): Map<string, string> => {
	let idx = indexByLayer.get(dir);
	if (!idx) indexByLayer.set(dir, (idx = indexLayer(dir)));
	return idx;
};

/** The member file stems of an enumeration dir (`concepts/enumeration/<name>/`) — an `enums:`
 *  target's value set (the literals). */
export function enumerationMembers(name: string): string[] {
	const dir = join(CONCEPTS, 'enumeration', name);
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => f.slice(0, -'.json'.length))
		.sort();
}

/** The enumeration dir names (`concepts/enumeration/<name>/`) as a Set — the valid `enums:` targets,
 *  the set both vocab guards test membership against. */
export const enumerationDirNames = (): Set<string> =>
	new Set(
		readdirSync(ENUMERATION_DIR).filter((n) => statSync(join(ENUMERATION_DIR, n)).isDirectory()),
	);

/** A def's slug-list field (`compose`/`enums`/`props`/`features`): entries are BARE SLUGS — a
 *  use-site rename object would break the name→def lookup chain. */
export function asList(v: unknown, field: string, stack: string[]): string[] {
	if (v === undefined) return [];
	if (!Array.isArray(v))
		throw new Error(`grimoire compile: \`${field}\` must be an array (via ${stack.join(' → ')})`);
	return v.map((entry) => {
		if (typeof entry !== 'string') {
			throw new Error(
				`grimoire compile: \`${field}\` entries are bare slugs — got ${JSON.stringify(entry)} (via ${stack.join(' → ')})`,
			);
		}
		return entry;
	});
}

/** slug → file path for a field-backing doc: a `property/` field, or an `enumeration/` member used
 *  as a field (a quantity_kind kind bound via `feature: spec_block`). The two layers share one flat
 *  slug space (stems globally unique), so a prop resolves from whichever defines it. */
export const fieldSource = (slug: string): string | undefined =>
	layerIndex('property').get(slug) ?? layerIndex('enumeration').get(slug);

/** A def's FEATURE-only grammar (concepts/features/feature_settings.yaml): the fields it groups
 *  (`prop`) and the enumerations it binds (`enums`). The one accessor — reads through the block
 *  rather than the document root, where these keys no longer live. */
export const featureSettingsOf = (def: Obj): Obj =>
	isPlainObject(def.feature_settings) ? (def.feature_settings as Obj) : {};

/** The def-language keys the resolver consumes off a `def` — everything else it states is node data
 *  (dataOf keeps it). DERIVED, not listed: the def language lives entirely in `*_settings` blocks
 *  (`concept_settings` shared, `feature_settings` feature-only, `archetype_settings` archetype-only),
 *  so the suffix IS the rule and a new block needs no edit here. Note `schema` is deliberately absent
 *  — it's a projection passthrough (kit/project.ts merges an object node's `schema:` block), so it
 *  must survive as node data; it used to be added here only for the caller to delete again. */
export const instructionKeys = (def: Obj): Set<string> =>
	new Set(Object.keys(def).filter((key) => key.endsWith('_settings')));

/** A field's scribed source doc — the `_defaults.yaml` cascade is already folded in (scribe did it),
 *  so this is a plain read. Backs a `property/` field or an `enumeration/` member used as a field
 *  (a quantity_kind kind bound via `feature: spec_block`). */
export function propertyDoc(slug: string): { doc: Obj; path: string } {
	const path = fieldSource(slug);
	if (!path)
		throw new Error(
			`grimoire compile: no property/**/ or enumeration/**/${slug}.json backs prop "${slug}"`,
		);
	return { doc: readJson(path), path };
}
