// Source indexes for the concept layers (concepts/property|features|archetypes|parts) —
// the file-walking half of the YAML→schema compiler (kit/compile.ts holds the composition).
// BUILD- AND TEST-ONLY: imports `yaml` + `fs`; nothing on the runtime path may import it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const CONCEPTS = join(import.meta.dirname, '..', 'concepts');

/** Every `.yaml` under `dir` recursively (absolute paths), skipping `_`-prefixed cascade files. */
export function yamlFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		if (name.startsWith('_')) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...yamlFiles(p));
		else if (name.endsWith('.yaml')) out.push(p);
	}
	return out;
}

export const readYaml = (path: string): Obj => (parseYaml(readFileSync(path, 'utf8')) ?? {}) as Obj;

/** slug → file path for one concept layer dir; slugs are file stems, unique per layer. */
function indexLayer(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const path of yamlFiles(join(CONCEPTS, dir))) {
		const slug = path.split('/').pop()!.slice(0, -'.yaml'.length);
		const prior = out.get(slug);
		if (prior) throw new Error(`grimoire compile: ${dir}/ has two files for slug "${slug}" (${prior}, ${path})`);
		out.set(slug, path);
	}
	return out;
}

const layerIndexes = new Map<string, Map<string, string>>();
export const layerIndex = (dir: string): Map<string, string> => {
	let idx = layerIndexes.get(dir);
	if (!idx) layerIndexes.set(dir, (idx = indexLayer(dir)));
	return idx;
};

/** The member file stems of an enumeration dir (`concepts/enumeration/<name>/`) — an `enums:`
 *  target's value set (the literals). */
export function enumerationMembers(name: string): string[] {
	const dir = join(CONCEPTS, 'enumeration', name);
	return readdirSync(dir)
		.filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
		.map((f) => f.slice(0, -'.yaml'.length))
		.sort();
}

/** A def's slug-list field (`compose`/`enums`/`props`/`features`): entries are BARE SLUGS — a
 *  use-site rename object would break the name→def lookup chain. */
export function asList(v: unknown, field: string, stack: string[]): string[] {
	if (v === undefined) return [];
	if (!Array.isArray(v)) throw new Error(`grimoire compile: \`${field}\` must be an array (via ${stack.join(' → ')})`);
	return v.map((entry) => {
		if (typeof entry !== 'string') {
			throw new Error(`grimoire compile: \`${field}\` entries are bare slugs — got ${JSON.stringify(entry)} (via ${stack.join(' → ')})`);
		}
		return entry;
	});
}

/** slug → file path for a field-backing doc: a `property/` field, or an `enumeration/` member used
 *  as a field (a quantity_kind kind bound via `feature: spec_block`). The two layers share one flat
 *  slug space (stems globally unique), so a prop resolves from whichever defines it. */
export const fieldSource = (slug: string): string | undefined => layerIndex('property').get(slug) ?? layerIndex('enumeration').get(slug);

/** A field's source doc with its immediate dir `_defaults.yaml` merged under it (member wins) —
 *  the same cascade the enumeration bake applies, so a dir-wide fact (e.g. quantity_kind's
 *  archetype / `feature: spec_block` binding) lives once in the dir. */
export function propertyDoc(slug: string): { doc: Obj; path: string } {
	const path = fieldSource(slug);
	if (!path) throw new Error(`grimoire compile: no property/**/ or enumeration/**/${slug}.yaml backs prop "${slug}"`);
	const defaultsPath = join(path.slice(0, path.lastIndexOf('/')), '_defaults.yaml');
	let defaults: Obj = {};
	try {
		defaults = readYaml(defaultsPath);
	} catch {
		// no category defaults file
	}
	return { doc: { ...defaults, ...readYaml(path) }, path };
}
