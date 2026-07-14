// Guard: every FOREIGN KEY in the baked concepts resolves to a real entry.
//
// A property declares its FK once, in data — `column.references: <archetype>` (concepts/features/
// column.yaml, composed onto the `property` archetype). This guard reads that declaration for EVERY
// property, then walks every generated doc — catalog entries AND the concept layers (property /
// feature / archetype / enumeration), since crosswalk `refs` ride on any of them. Wherever a field
// named by such a property carries a value, the value MUST be the `identity.slug` of an entry of the
// referenced archetype. The `catalog_item` shape (`{archetype, slug}`) is resolved too — its target
// archetype rides the value. Add a new FK by adding `column.references` to a property; NO new guard.
//
// Registries are external Classes (docs/reference-model.md): a crosswalk row's `registry_id` is an FK
// to a `registry` catalog entry, and its `term` is an id WITHIN that registry. We can't fetch the IRI
// offline, so where the registry carries an `iri_template` we validate the term by SHAPE — it must be
// a single substitutable token (no whitespace), i.e. it fits `{id}` in the template.
//
// Root alias: `node scripts/guard-refs.ts`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isPlainObject } from 'remeda';
import { join } from 'node:path';
import {
	ARTIFACTS_CATALOG_DIR,
	ARTIFACTS_DIR,
	type Obj,
	layerIndex,
	propertyDoc,
} from '../src/concept-sources.ts';
import { runGuard } from './guard-report.ts';

// FK map: property slug → referenced archetype, read from each property's `column.references`.
const fkByProp = new Map<string, string>();
for (const slug of layerIndex('property').keys()) {
	const column = propertyDoc(slug).doc.column;
	const target = isPlainObject(column) ? column.references : undefined;
	if (typeof target === 'string') fkByProp.set(slug, target);
}

// Valid slugs per archetype, from the baked catalog (identity.archetype → set of identity.slug), plus
// each registry's iri_template (for the term shape-check).
const validByArchetype = new Map<string, Set<string>>();
const registryIri = new Map<string, string>();
for (const file of readdirSync(ARTIFACTS_CATALOG_DIR).filter((f) => f.endsWith('.json'))) {
	const data = JSON.parse(readFileSync(join(ARTIFACTS_CATALOG_DIR, file), 'utf8')) as Obj;
	const identity = data.identity;
	if (
		!isPlainObject(identity) ||
		typeof identity.archetype_id !== 'string' ||
		typeof identity.slug !== 'string'
	)
		continue;
	(
		validByArchetype.get(identity.archetype_id) ??
		validByArchetype.set(identity.archetype_id, new Set()).get(identity.archetype_id)!
	).add(identity.slug);
	const pub = data.registry_publication;
	if (
		identity.archetype_id === 'registry' &&
		isPlainObject(pub) &&
		typeof pub.iri_template === 'string'
	)
		registryIri.set(identity.slug, pub.iri_template);
}

// Every generated DATA doc (not the *.schema.json wire contracts, not *.ts modules) that may carry a
// ref or FK: the catalog entries plus the concept layers.
function dataDocs(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...dataDocs(p));
		else if (name.endsWith('.json') && !name.endsWith('.schema.json')) out.push(p);
	}
	return out;
}

const knows = (archetype: string, slug: string): boolean =>
	validByArchetype.get(archetype)?.has(slug) ?? false;
const validSet = (archetype: string): string =>
	[...(validByArchetype.get(archetype) ?? [])].sort().join(', ') ||
	'(no entries of this archetype)';

function walk(options: {
	file: string;
	node: unknown;
	where: string;
	fail: (line: string) => void;
}): void {
	const { file, node, where, fail } = options;
	if (Array.isArray(node)) {
		node.forEach((value, index) => walk({ ...options, node: value, where: `${where}[${index}]` }));
		return;
	}
	if (!isPlainObject(node)) return;
	if (typeof node.registry_id === 'string' && typeof node.term === 'string') {
		const template = registryIri.get(node.registry_id);
		if (template && /\s/.test(node.term))
			fail(
				`${file} at ${where}.term: term "${node.term}" has whitespace — cannot fill {id} in ${node.registry_id} (${template})`,
			);
	}
	for (const [key, value] of Object.entries(node)) {
		const at = where ? `${where}.${key}` : key;
		if (key === 'catalog_item' && isPlainObject(value)) checkCatalogItem({ file, at, value, fail });
		const target = fkByProp.get(key);
		if (target && typeof value === 'string' && !knows(target, value))
			fail(
				`${file} at ${at}: ${key} → ${target}/${value} — no such ${target} (have: ${validSet(target)})`,
			);
		walk({ file, node: value, where: at, fail });
	}
}

function checkCatalogItem(options: {
	file: string;
	at: string;
	value: Record<string, unknown>;
	fail: (line: string) => void;
}) {
	const { file, at, value, fail } = options;
	if (typeof value.archetype !== 'string' || typeof value.slug !== 'string') return;
	if (!knows(value.archetype, value.slug))
		fail(
			`${file} at ${at}: catalog_item → ${value.archetype}/${value.slug} — no such entry (have: ${validSet(value.archetype)})`,
		);
}

runGuard({ header: (count) => `guard-refs: ${count} dangling reference(s):` }, (fail) => {
	const docs = dataDocs(ARTIFACTS_DIR);
	for (const file of docs)
		walk({
			file: file.slice(ARTIFACTS_DIR.length + 1),
			node: JSON.parse(readFileSync(file, 'utf8')),
			where: '',
			fail,
		});
	return `guard-refs: ${docs.length} docs, ${fkByProp.size} FK field(s), ${registryIri.size} templated registries — all references resolve.`;
});
