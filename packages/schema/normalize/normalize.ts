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
import { classByName, classByTable, fkTable, ownerSlotFor, seg, SLUG } from './model.ts';

export type Row = Record<string, unknown> & { $trail: string; $slot?: string };

/** authored FK values are bare slugs; a slot ranging a table-backed class
 * expands them to CURIEs (broader: linear-velocity → node:quantity-kind/…) */
function expand(slot: string, value: unknown, trail: string): unknown {
	const table = fkTable(slot);
	if (!table) return value;
	if (typeof value !== 'string' || !SLUG.test(value))
		throw new Error(`${trail}: expected a bare ${table} slug`);
	return `node:${seg(table)}/${value}`;
}

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
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${trail}: expected a map keyed by ${keyedBy}`);
	const ordered = child.slots?.includes('ordinal');
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
		return {
			...expanded,
			...(ordered ? { ordinal: i + 1 } : {}),
			node: `${node}/${seg(k)}`,
			...(child.slots?.includes('about') ? { about: node } : {}),
			// the key stays a column only when the child class still has it — slug
			// is the node leaf now (on the node row), never a facet column
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
	if (rows.some((r) => r.$slot === 'facets' && r.table === 'content')) return;
	rows.push({
		node: `${node}/content`,
		table: 'content',
		cardinality: 'child',
		$slot: 'facets',
		$trail: `${slug}.content`,
	});
}

/** one authored doc → flat storage rows: root first, children after */
export function normalize(file: string): Row[] {
	const table = basename(dirname(file));
	const className = classByTable[table];
	if (!className) throw new Error(`${file}: no class has sql_table ${table}`);
	const ownSlots = classByName[className]?.slots ?? [];

	const slug = basename(file, '.yaml');
	if (!SLUG.test(slug)) throw new Error(`${file}: filename is not a slug`);
	const node = `node:${seg(table)}/${slug}`;
	const doc = (readYaml(file) ?? {}) as Record<string, unknown>;

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
