// Materialize enumeration/quantity_kind/ from the FULL QUDT set — every kind in the oracle, no
// selection, no curation. slug = snake(QUDT localname).
//
// DERIVED from the oracle: title.en, identity.broader, the wikidata ref, the qudt_quantity_kind ref.
// PRESERVED from whatever member file already exists: every other authored key (description, schema,
// pt label, measurand, foreign-registry refs). The harvest is GENERIC — it keeps what it doesn't own
// rather than naming fields in a table — so a kind gains local facts simply by being authored here.
// A member's own `qudt_quantity_kind` term decides which QUDT kind it binds (falling back to its file
// stem), so re-filing a concept into this directory is enough to merge it.
//
// Re-runnable/idempotent (rewrites members, keeps _defaults). Run: `node scripts/vocab/import-quantity-kinds.ts`.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isPlainObject } from 'remeda';
import { parse, stringify } from 'yaml';
import { loadOracle } from './qudt.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', '..', 'concepts', 'enumeration', 'quantity_kind');

const snake = (s: string): string =>
	s
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.toLowerCase();

type Ref = Record<string, unknown>;
/** Keys this importer OWNS — regenerated from the oracle every run. Everything else an existing
 *  member carries is authored local fact and is preserved verbatim. */
const DERIVED_KEYS = new Set(['title', 'refs', 'identity']);
const DERIVED_REGISTRIES = new Set(['qudt_quantity_kind', 'wikidata']);

type Local = { pt?: string; foreignRefs: Ref[]; rest: Record<string, unknown>; match?: string };

// Harvest every existing member: its authored keys, keyed by the QUDT-faithful slug its own qudt term
// implies (file stem when it carries none) — so a moved-in property lands on its kind automatically.
const localBySlug = new Map<string, Local>();
for (const file of readdirSync(DIR)) {
	if (!file.endsWith('.yaml') || file === '_defaults.yaml') continue;
	const stem = file.slice(0, -'.yaml'.length);
	const doc = parse(readFileSync(join(DIR, file), 'utf8')) as Record<string, unknown>;
	const refs = Array.isArray(doc.refs) ? (doc.refs as Ref[]) : [];
	const qudtRef = refs.find((r) => isPlainObject(r) && r.registry_id === 'qudt_quantity_kind');
	const term = typeof qudtRef?.term === 'string' ? qudtRef.term : undefined;
	const title = isPlainObject(doc.title) ? doc.title : {};
	const rest = Object.fromEntries(Object.entries(doc).filter(([k]) => !DERIVED_KEYS.has(k)));
	localBySlug.set(term ? snake(term) : stem, {
		pt: typeof title.pt === 'string' ? title.pt : undefined,
		foreignRefs: refs.filter(
			(r) => isPlainObject(r) && !DERIVED_REGISTRIES.has(String(r.registry_id)),
		),
		rest,
		match: typeof qudtRef?.match === 'string' ? qudtRef.match : undefined,
	});
}

const oracle = loadOracle();

// QUDT carries legacy hyphenated aliases beside the modern CamelCase kind (`Half-Life` / `HalfLife`)
// which snake to the same slug — keep the CamelCase one, drop the legacy twin.
const termBySlug = new Map<string, string>();
for (const term of Object.keys(oracle)) {
	const slug = snake(term);
	const held = termBySlug.get(slug);
	if (held === undefined || (held.includes('-') && !term.includes('-'))) termBySlug.set(slug, term);
}

for (const file of readdirSync(DIR))
	if (file.endsWith('.yaml') && file !== '_defaults.yaml') rmSync(join(DIR, file));

let wrote = 0;
for (const [slug, term] of termBySlug) {
	const kind = oracle[term]!;
	const local = localBySlug.get(slug);
	const refs: Ref[] = [
		{ registry_id: 'qudt_quantity_kind', term, match: local?.match ?? 'exact' },
	];
	if (kind.wikidata) refs.push({ registry_id: 'wikidata', term: kind.wikidata, match: 'exact' });
	if (local) refs.push(...local.foreignRefs);
	const broader = kind.broader ? snake(kind.broader) : undefined;

	writeFileSync(
		join(DIR, `${slug}.yaml`),
		stringify(
			{
				title: {
					en: kind.label.length >= 3 ? kind.label : term,
					...(local?.pt ? { pt: local.pt } : {}),
				},
				refs,
				...(broader && termBySlug.has(broader) ? { identity: { broader } } : {}),
				...(local?.rest ?? {}), // description / schema / measurand / anything else authored
			},
			{ lineWidth: 0 },
		),
	);
	wrote++;
}
console.log(`quantity_kind: wrote ${wrote} members (${localBySlug.size} carried authored local facts)`);
