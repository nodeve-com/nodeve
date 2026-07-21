// THE normalizer (docs/authoring-storage-handoff.md): destructure authored
// data/ docs into gen/catalog.yaml, the one root object linkml-sqldb dumps.
//
//   node normalize/catalog.ts                        build the catalog
//   node normalize/catalog.ts data/registry/x.yaml   print one doc's rows (debug)
//
// Everything is read from the schema, never hardcoded:
//   Catalog slot        → class via its range, data dir via sql_table
//   authored child key  → child class via sql_table (content: → Content)
//   child map's keys    → the slot named by the child class's keyed_by
// Filename is the slug; node paths derive from the trail; every row carries
// its source trail until serialization. Two input shapes per file, decided by
// the presence of a `node` key: authored (normalized) or legacy storage rows
// (passthrough until that kind's authored form lands). A file the normalizer
// rejects is SKIPPED LOUDLY, never silently dropped.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { shortCode } from '@nodeve/encoding/short-code';
import { basename, dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import { atRoot, classByName, classByTable, fkTable, seg, slotByName, SLUG } from './model.ts';

/** authored FK values are bare slugs; a slot ranging a table-backed class
 * expands them to CURIEs (broader: linear-velocity → node:quantity-kind/…) */
function expand(slot: string, value: unknown, trail: string): unknown {
	const table = fkTable(slot);
	if (!table) return value;
	if (typeof value !== 'string' || !SLUG.test(value))
		throw new Error(`${trail}: expected a bare ${table} slug`);
	return `node:${seg(table)}/${value}`;
}

type Row = Record<string, unknown> & { $trail: string; $slot?: string };

/** one keyed child map → its rows (content: {en: …} → Content rows) */
function keyedChildren(
	childClass: string,
	value: unknown,
	ctx: { node: string; trail: string },
): Row[] {
	const { node, trail } = ctx;
	const child = classByName[childClass];
	const keyedBy = child.annotations?.keyed_by;
	if (!keyedBy) throw new Error(`${trail}: ${childClass} has no keyed_by annotation`);
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${trail}: expected a map keyed by ${keyedBy}`);
	return Object.entries(value).map(([k, payload]) => {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload))
			throw new Error(`${trail}.${k}: expected a map of columns`);
		const expanded = Object.fromEntries(
			Object.entries(payload).map(([ck, cv]) => {
				if (!child.slots?.includes(ck))
					throw new Error(`${trail}.${k}.${ck}: not a ${childClass} slot`);
				return [ck, expand(ck, cv, `${trail}.${k}.${ck}`)];
			}),
		);
		return {
			...expanded,
			node: `${node}/${k}`,
			...(child.slots?.includes('about') ? { about: node } : {}),
			[keyedBy]: expand(keyedBy, k, `${trail}.${k}`),
			$trail: `${trail}.${k}`,
		};
	});
}

/** one authored doc → flat storage rows: root first, children after */
export function normalize(file: string): Row[] {
	const table = basename(dirname(file));
	const className = classByTable[table];
	if (!className) throw new Error(`${file}: no class has sql_table ${table}`);
	const ownSlots = classByName[className].slots ?? [];

	const slug = basename(file, '.yaml');
	if (!SLUG.test(slug)) throw new Error(`${file}: filename is not a slug`);
	const node = `node:${seg(table)}/${slug}`;
	const doc = parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

	const row: Row = { node, slug, $trail: slug };
	const rows = [row];
	for (const [key, value] of Object.entries(doc)) {
		const childClass = classByTable[key];
		if (childClass) {
			const ownerSlot = ownSlots.find((s) => slotByName[s]?.range === childClass);
			if (!ownerSlot)
				throw new Error(`${slug}.${key}: ${className} has no slot ranging ${childClass}`);
			for (const childRow of keyedChildren(childClass, value, { node, trail: `${slug}.${key}` }))
				rows.push({ ...childRow, $slot: ownerSlot });
		} else if (ownSlots.includes(key)) {
			row[key] = expand(key, value, `${slug}.${key}`);
		} else {
			throw new Error(`${slug}.${key}: not a ${className} slot and no class has sql_table ${key}`);
		}
	}
	return rows;
}

// ─── catalog build (only as the entrypoint — importers get normalize alone) ──

const paths: string[] = [];

/** drop the $-tags — they are source bookkeeping, never catalog columns */
const strip = (row: Row): Record<string, unknown> =>
	Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('$')));

/** flat rows → one nested storage row; every node feeds the id space */
function assemble(rows: Row[]): Record<string, unknown> {
	for (const row of rows) paths.push((row.node as string).replace(/^node:/, ''));
	const [root, ...children] = rows;
	const nested = strip(root);
	for (const child of children) ((nested[child.$slot!] ??= []) as unknown[]).push(strip(child));
	return nested;
}

/** legacy id derivation: every map naming a thing carries `slug` or `role` —
 * features key by role, everything else by slug. One segment per level. */
function collectPaths(value: unknown, trail: string[]) {
	if (Array.isArray(value)) {
		for (const item of value) collectPaths(item, trail);
		return;
	}
	if (!value || typeof value !== 'object') return;
	const row = value as Record<string, unknown>;
	const segment = [row.slug, row.role].find((s) => typeof s === 'string') as string | undefined;
	const next = segment === undefined ? trail : [...trail, segment];
	if (segment !== undefined) paths.push(next.join('/'));
	for (const child of Object.values(row)) collectPaths(child, next);
}

if (import.meta.main && process.argv[2]) {
	console.log(JSON.stringify(normalize(process.argv[2]), null, 2));
} else if (import.meta.main) {
	build();
}

// ─── node rows ───────────────────────────────────────────────────────────────
// The id space, DERIVED — where a thing is authored already states its identity.
// slug_qualified = the ancestor trail (docs/levels.md); code = shortCode(trail),
// a url shortener over the PK. The CURIE is hashed, never a url — domains are
// a deployment fact.

function mintNodes(): unknown[] {
	const seen = new Set<string>();
	for (const path of paths) {
		if (seen.has(path)) throw new Error(`duplicate node path: node:${path}`);
		seen.add(path);
	}
	return [...seen]
		.sort()
		.map((path) => ({ slug_qualified: `node:${path}`, code: shortCode(`node:${path}`) }));
}

/** one data dir → its catalog rows: authored files normalized, legacy passed through */
function tableRows(dir: string): unknown[] {
	const out: unknown[] = [];
	const files = readdirSync(atRoot(`data/${dir}`)).filter((f) => f.endsWith('.yaml'));
	for (const f of files.sort()) {
		const doc = parse(readFileSync(atRoot(`data/${dir}/${f}`), 'utf8')) as Record<string, unknown>;
		if (typeof doc.node === 'string') {
			collectPaths(doc, [doc.node.replace(/^node:/, '').split('/')[0]]);
			out.push(doc);
			continue;
		}
		try {
			out.push(assemble(normalize(atRoot(`data/${dir}/${f}`))));
		} catch (e) {
			console.warn(`SKIP ${dir}/${f}: ${(e as Error).message}`);
		}
	}
	return out;
}

function build() {
	const container = classByName.Catalog?.attributes as
		Record<string, { range: string }> | undefined;
	if (!container) throw new Error('nodeve.yaml: no Catalog container class');

	const bundle: Record<string, unknown[]> = {};
	for (const [slot, { range }] of Object.entries(container)) {
		if (range === 'Node') continue; // derived below, no data dir
		const dir = classByName[range]?.annotations?.sql_table;
		if (!dir) throw new Error(`Catalog.${slot}: range ${range} has no sql_table annotation`);
		bundle[slot] = tableRows(dir);
	}

	bundle.nodes = mintNodes();

	mkdirSync(atRoot('gen'), { recursive: true });
	writeFileSync(
		atRoot('gen/catalog.yaml'),
		'# GENERATED by normalize/catalog.ts from data/ — the ingest root, not a source.\n' +
			stringify(bundle, { lineWidth: 0 }),
	);
	console.log(
		Object.entries(bundle)
			.map(([k, v]) => `${v.length} ${k}`)
			.join(', ') + ' → gen/catalog.yaml',
	);
}
