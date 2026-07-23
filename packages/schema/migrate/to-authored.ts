// Storage-shape data/ files → authored form: the schema-driven INVERSE of
// normalize/catalog.ts normalize(). Drops derived coordinates (node, slug,
// per-child node/about), turns each keyed_by child list into a map keyed by
// that slot (bare slugs for class-ranged keys and FK columns), and refuses
// any key it does not recognize.
//
//   node migrate/to-authored.ts <table> [<table>…]   # e.g. node_type
import { abs, readYaml, write, yamlNames } from '../src/io.ts';
import { dumpYaml } from '../src/yaml-style.ts';
import { classByName, classByTable, fkTable, seg, slotByName } from '../normalize/model.ts';

type Stored = Record<string, unknown>;

const bare = (value: unknown, prefix: string, trail: string): string => {
	if (typeof value !== 'string' || !value.startsWith(prefix))
		throw new Error(`${trail}: expected ${prefix}…, got ${value}`);
	return value.slice(prefix.length);
};

/** a stored column value → its authored form (FK CURIEs become bare slugs) */
const authoredValue = (slot: string, value: unknown, trail: string): unknown => {
	const table = fkTable(slot);
	return table ? bare(value, `node:${seg(table)}/`, trail) : value;
};

/** a keyed_by child list → the authored map keyed by that slot */
function authoredMap(childClass: string, items: Stored[], trail: string): Stored {
	const child = classByName[childClass];
	if (!child) throw new Error(`${trail}: no class ${childClass}`);
	const keyedBy = child.annotations!.keyed_by!;
	const map: Stored = {};
	for (const item of items) {
		const k = authoredValue(keyedBy, item[keyedBy], `${trail}.${keyedBy}`) as string;
		if (map[k]) throw new Error(`${trail}: duplicate ${keyedBy} ${k}`);
		const entry: Stored = {};
		for (const [ck, cv] of Object.entries(item)) {
			if (ck === 'node' || ck === 'about' || ck === keyedBy) continue;
			if (!child.slots?.includes(ck))
				throw new Error(`${trail}.${k}.${ck}: not a ${childClass} slot`);
			entry[ck] = authoredValue(ck, cv, `${trail}.${k}.${ck}`);
		}
		map[k] = entry;
	}
	return map;
}

function migrateFile(table: string, className: string, f: string): void {
	const path = abs(`data/${table}/${f}`);
	const doc = readYaml(path) as Stored;
	if (!('node' in doc)) {
		console.log(`skip ${table}/${f} (already authored form)`);
		return;
	}
	const ownSlots = classByName[className]?.slots ?? [];
	const slug = f.replace(/\.yaml$/, '');
	if (doc.slug !== slug) throw new Error(`${table}/${f}: slug ${doc.slug} != filename`);
	if (doc.node !== `node:${seg(table)}/${slug}`)
		throw new Error(`${table}/${f}: unexpected node ${doc.node}`);

	const authored: Stored = {};
	for (const [key, value] of Object.entries(doc)) {
		if (key === 'node' || key === 'slug') continue;
		if (!ownSlots.includes(key)) throw new Error(`${slug}.${key}: not a ${className} slot`);
		const childClass = slotByName[key]?.range ?? '';
		const keyedBy = classByName[childClass]?.annotations?.keyed_by;
		if (keyedBy) {
			const authoredKey = classByName[childClass]!.annotations!.sql_table!;
			authored[authoredKey] = authoredMap(childClass, value as Stored[], `${slug}.${key}`);
		} else {
			authored[key] = authoredValue(key, value, `${slug}.${key}`);
		}
	}
	write(path, dumpYaml(authored));
	console.log(`migrated ${table}/${f}`);
}

function migrate(table: string): void {
	const className = classByTable[table];
	if (!className) throw new Error(`no class has sql_table ${table}`);
	for (const f of yamlNames(abs(`data/${table}`))) migrateFile(table, className, f);
}

const tables = process.argv.slice(2);
if (!tables.length) throw new Error('usage: node migrate/to-authored.ts <table>…');
for (const table of tables) migrate(table);
