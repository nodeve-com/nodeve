// Authored data/ doc → flat storage rows (root first, children after). The pure
// normalizer half of the catalog build — no disk walk, no bundle assembly, those
// live in catalog.ts which drives this over every data dir.
//
// Everything is read from the schema, never hardcoded:
//   authored child key  → child class via sql_table (content: → Content)
//   child map's keys    → the slot named by the child class's keyed_by
// Filename is the slug; node paths derive from the trail; every row carries its
// source trail until serialization.
import { basename, dirname } from 'node:path';
import { readYaml } from '../src/io.ts';
import { classByName, classByTable, expandFk as expand, ownerSlotFor, seg, SLUG } from './model.ts';
import { isMap } from './registers.ts';

export type Row = Record<string, unknown> & { $trail: string; $slot?: string };

// node-level attributes (url) are authored under a `node:` block and merged onto
// the minted node row — NOT a facet column. permalink/code/node_type/slug are
// derived, never authored.
const DERIVED_NODE_SLOTS = new Set(['permalink', 'code', 'node_type', 'slug']);
const nodeAttrSlots = new Set(
	(classByName.Node?.slots ?? []).filter((s) => !DERIVED_NODE_SLOTS.has(s)),
);
export const nodeAttrMap = new Map<string, Record<string, unknown>>();

/** one keyed child map → its rows (content: {en: …} → Content rows) */
function keyedChildren(
	childClass: string,
	value: unknown,
	ctx: { node: string; trail: string },
): Row[] {
	const { node, trail } = ctx;
	const child = classByName[childClass];
	if (!child) throw new Error(`${trail}: no class ${childClass}`);
	const keyedBy = child.annotations?.keyed_by;
	if (!keyedBy) throw new Error(`${trail}: ${childClass} has no keyed_by annotation`);
	if (!isMap(value)) throw new Error(`${trail}: expected a map keyed by ${keyedBy}`);
	const ordered = child.slots?.includes('ordinal');
	const keyDefault = child.annotations?.key_default as string | undefined; // slot ← key when unauthored
	return Object.entries(value).map(([k, payload], i) => {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload))
			throw new Error(`${trail}.${k}: expected a map of columns`);
		const expanded = Object.fromEntries(
			Object.entries(payload).map(([ck, cv]) => {
				if (!child.slots?.includes(ck))
					throw new Error(`${trail}.${k}.${ck}: not a ${childClass} slot`);
				return [ck, expand(ck, cv, `${trail}.${k}.${ck}`)];
			}),
		);
		if (keyDefault && !(keyDefault in expanded))
			expanded[keyDefault] = expand(keyDefault, k, trail);
		return {
			...expanded,
			...(ordered ? { ordinal: i + 1 } : {}),
			node: `${node}/${seg(k)}`,
			...(child.slots?.includes('about') ? { about: node } : {}),
			...(child.slots?.includes(keyedBy) ? { [keyedBy]: expand(keyedBy, k, `${trail}.${k}`) } : {}),
			$trail: `${trail}.${k}`,
		};
	});
}

/** the `node:` block — node-level attributes (url) merged onto the node row;
 * slug is the filename, never authored */
function nodeBlock(node: string, value: unknown, slug: string): void {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${slug}.node: expected a map of node attributes`);
	const attrs = nodeAttrMap.get(node) ?? {};
	for (const [nk, nv] of Object.entries(value)) {
		if (nk === 'slug') throw new Error(`${slug}.node.slug: slug is the filename, never authored`);
		if (!nodeAttrSlots.has(nk)) throw new Error(`${slug}.node.${nk}: not a node attribute`);
		attrs[nk] = expand(nk, nv, `${slug}.node.${nk}`);
	}
	nodeAttrMap.set(node, attrs);
}

/** content is a universal child facet — auto-composed into every node_type,
 * never authored in the facet: map */
function autoComposeContent(rows: Row[], node: string, slug: string): void {
	if (rows.some((r) => r.$slot === 'facets' && r.facet === 'content')) return;
	rows.push({
		node: `${node}/content`,
		relation: 'content',
		facet: 'content',
		cardinality: 'child',
		$slot: 'facets',
		$trail: `${slug}.content`,
	});
}

/** one doc → flat storage rows: root first, children after. `table` is the
 * class's sql_table, `slug` the node's leaf id, `doc` the authored (or derived)
 * map. normalize() reads these off a file; derived node_types synthesize them. */
export function normalizeDoc(table: string, slug: string, doc: Record<string, unknown>): Row[] {
	const className = classByTable[table];
	if (!className) throw new Error(`${slug}: no class has sql_table ${table}`);
	const ownSlots = classByName[className]?.slots ?? [];

	if (!SLUG.test(slug)) throw new Error(`${table}/${slug}: not a slug`);
	const node = `node:${seg(table)}/${slug}`;

	const row: Row = { node, $trail: slug };
	const rows = [row];
	for (const [key, value] of Object.entries(doc)) {
		if (key === 'node') {
			nodeBlock(node, value, slug);
			continue;
		}
		const childClass = classByTable[key];
		// an own slot wins over a same-named child table (feature_type the FK
		// column vs feature_type the table)
		if (childClass && !ownSlots.includes(key)) {
			const ownerSlot = ownerSlotFor(className, childClass);
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
	if (className === 'NodeType') autoComposeContent(rows, node, slug);
	return rows;
}

/** one authored data/ file → rows, via its dir (sql_table) and filename (slug) */
export function normalize(file: string): Row[] {
	return normalizeDoc(
		basename(dirname(file)),
		basename(file, '.yaml'),
		(readYaml(file) ?? {}) as Record<string, unknown>,
	);
}
