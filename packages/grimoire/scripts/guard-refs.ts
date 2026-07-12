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
// Root alias: `bun run guard:refs`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type Obj, isObj, layerIndex, propertyDoc } from '../kit/concept-sources.ts';

const GENERATED_DIR = join(import.meta.dir, '../generated');
const CATALOG_DIR = join(GENERATED_DIR, 'catalog');

// FK map: property slug → referenced archetype, read from each property's `column.references`.
const fkProps = new Map<string, string>();
for (const slug of layerIndex('property').keys()) {
	const column = propertyDoc(slug).doc.column;
	const target = isObj(column) ? column.references : undefined;
	if (typeof target === 'string') fkProps.set(slug, target);
}

// Valid slugs per archetype, from the baked catalog (identity.archetype → set of identity.slug), plus
// each registry's iri_template (for the term shape-check).
const validByArchetype = new Map<string, Set<string>>();
const registryIri = new Map<string, string>();
for (const file of readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'))) {
	const data = JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8')) as Obj;
	const identity = data.identity;
	if (!isObj(identity) || typeof identity.archetype !== 'string' || typeof identity.slug !== 'string') continue;
	(validByArchetype.get(identity.archetype) ?? validByArchetype.set(identity.archetype, new Set()).get(identity.archetype)!).add(
		identity.slug,
	);
	const pub = data.registry_publication;
	if (identity.archetype === 'registry' && isObj(pub) && typeof pub.iri_template === 'string')
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

type Violation = { file: string; where: string; msg: string };
const violations: Violation[] = [];
const knows = (archetype: string, slug: string): boolean => validByArchetype.get(archetype)?.has(slug) ?? false;
const validSet = (archetype: string): string =>
	[...(validByArchetype.get(archetype) ?? [])].sort().join(', ') || '(no entries of this archetype)';

// Walk a node, checking any FK field / catalog_item ref / crosswalk term against the catalog.
function walk(file: string, node: unknown, where: string): void {
	if (Array.isArray(node)) {
		node.forEach((v, i) => walk(file, v, `${where}[${i}]`));
		return;
	}
	if (!isObj(node)) return;
	// A crosswalk row: registry_id resolves as an FK (below); its term must fit the registry's template.
	if (typeof node.registry_id === 'string' && typeof node.term === 'string') {
		const tmpl = registryIri.get(node.registry_id);
		if (tmpl && /\s/.test(node.term))
			violations.push({ file, where: `${where}.term`, msg: `term "${node.term}" has whitespace — cannot fill {id} in ${node.registry_id} (${tmpl})` });
	}
	for (const [key, value] of Object.entries(node)) {
		const at = where ? `${where}.${key}` : key;
		// catalog_item — target archetype rides the value.
		if (key === 'catalog_item' && isObj(value) && typeof value.archetype === 'string' && typeof value.slug === 'string') {
			if (!knows(value.archetype, value.slug))
				violations.push({ file, where: at, msg: `catalog_item → ${value.archetype}/${value.slug} — no such entry (have: ${validSet(value.archetype)})` });
		}
		// A property-declared FK — target archetype is fixed by the property.
		const target = fkProps.get(key);
		if (target && typeof value === 'string' && !knows(target, value))
			violations.push({ file, where: at, msg: `${key} → ${target}/${value} — no such ${target} (have: ${validSet(target)})` });
		walk(file, value, at);
	}
}

const docs = dataDocs(GENERATED_DIR);
for (const file of docs) walk(file.slice(GENERATED_DIR.length + 1), JSON.parse(readFileSync(file, 'utf8')), '');

if (violations.length) {
	console.error(`guard-refs: ${violations.length} dangling reference(s):`);
	for (const v of violations) console.error(`  ${v.file} at ${v.where}: ${v.msg}`);
	process.exit(1);
}
console.log(`guard-refs: ${docs.length} docs, ${fkProps.size} FK field(s), ${registryIri.size} templated registries — all references resolve.`);
