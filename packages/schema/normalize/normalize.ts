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
import { slugify } from '@nodeve/text/slugify';
import { readYaml } from '../src/io.ts';
import {
	classByName,
	classByTable,
	expandFk as expand,
	ownerSlotFor,
	seg,
	slotByName,
	SLUG,
} from './model.ts';
import { coRow, die, isMap, type Doc } from './registers.ts';

export type Row = Record<string, unknown> & { $trail: string; $slot?: string };

// node-level attributes (url) are authored under a `node:` block and merged onto
// the minted node row — NOT a facet column. permalink/code/node_type/slug are
// derived, never authored.
const DERIVED_NODE_SLOTS = new Set(['permalink', 'code', 'node_type', 'slug']);
const nodeAttrSlots = new Set(
	(classByName.Node?.slots ?? []).filter((s) => !DERIVED_NODE_SLOTS.has(s)),
);
export const nodeAttrMap = new Map<string, Record<string, unknown>>();

/** a child whose whole content IS its key (signalling: [ttl-3v3, ttl-5v]) may be
 * authored as the bare list — the rows the map form with empty bodies mints */
function authoredKeyed(value: unknown, keyedBy: string, trail: string): Doc {
	const map = Array.isArray(value)
		? Object.fromEntries(
				value.map((k) =>
					typeof k === 'string' ? [k, {}] : die(trail, `expected a list of ${keyedBy} slugs`),
				),
			)
		: value;
	return isMap(map) ? map : die(trail, `expected a map keyed by ${keyedBy}`);
}

/** a map key IS a column value, and YAML hands every key back as text — an
 * integer-ranged slot takes the number. Read off the slot's range, so a new
 * numeric key needs no rule of its own. */
function keyValue(slot: string, key: string, trail: string): unknown {
	const range = slotByName[slot]?.range;
	if (range !== 'integer' && range !== 'float') return expand(slot, key, trail);
	const n = Number(key);
	if (!Number.isFinite(n)) throw new Error(`${trail}: ${slot} takes a number, not ${key}`);
	return n;
}

/** an FK naming a row of THIS document (a placement's variant is one of its own
 * catalog's) resolves against the document root, not a data dir. Declared on the
 * slot — `annotations: { in_doc: true }` — never a table list in here. */
const inDoc = (slot: string) => slotByName[slot]?.annotations?.in_doc === true;

/** one child row's columns → its stored columns. Recurses: a payload key naming
 * another table is that child's own block, so a catalog nests field → flag
 * without a lowering per level. */
function childColumns(
	childClass: string,
	payload: Record<string, unknown>,
	ctx: { node: string; trail: string; root: string },
): Record<string, unknown> {
	const child = classByName[childClass]!;
	const expanded: Record<string, unknown> = {};
	for (const [ck, cv] of Object.entries(payload)) {
		const grandClass = classByTable[ck];
		const ownerSlot =
			grandClass && !child.slots?.includes(ck) ? ownerSlotFor(childClass, grandClass) : undefined;
		if (ownerSlot && grandClass) {
			expanded[ownerSlot] = children(grandClass, cv, {
				node: ctx.node,
				trail: `${ctx.trail}.${ck}`,
				root: ctx.root,
			});
		} else if (!child.slots?.includes(ck)) {
			throw new Error(`${ctx.trail}.${ck}: not a ${childClass} slot`);
		} else if (slotByName[ck]?.inlined) {
			// a 1:1 facet of this row — its own table, this row's node
			expanded[ck] = coRow(slotByName[ck]!.range!, { node: ctx.node, trail: `${ctx.trail}.${ck}` }, cv);
		} else {
			expanded[ck] = inDoc(ck) ? `${ctx.root}/${cv}` : expand(ck, cv, `${ctx.trail}.${ck}`);
		}
	}
	return expanded;
}

/** a child block → its rows. Two authored forms, and the SCHEMA picks which: a
 * class annotated `keyed_by` is a map whose key IS a column value; one annotated
 * `identified_by` is a LIST, each row identified by the first of those slots it
 * carries. The list form exists because a protocol that numbers its slots
 * publishes no name for them — a map would demand one, and the only way to
 * satisfy it is to invent one. */
function children(
	childClass: string,
	value: unknown,
	ctx: { node: string; trail: string; root: string },
): Row[] {
	const child = classByName[childClass];
	if (!child) throw new Error(`${ctx.trail}: no class ${childClass}`);
	const identifiedBy = child.annotations?.identified_by;
	return identifiedBy
		? listChildren(childClass, identifiedBy.split(' ').filter(Boolean), value, ctx)
		: keyedChildren(childClass, value, ctx);
}

/** the list form — rows carrying their own identity as a column */
function listChildren(
	childClass: string,
	idSlots: string[],
	value: unknown,
	ctx: { node: string; trail: string; root: string },
): Row[] {
	const { node, trail, root } = ctx;
	if (!Array.isArray(value)) throw new Error(`${trail}: expected a list of ${childClass} rows`);
	const child = classByName[childClass]!;
	const ordered = child.slots?.includes('ordinal');
	const seen = new Set<string>();
	return value.map((payload, i) => {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload))
			throw new Error(`${trail}[${i}]: expected a map of columns`);
		const row = payload as Record<string, unknown>;
		const idSlot = idSlots.find((s) => row[s] !== undefined);
		if (!idSlot)
			throw new Error(`${trail}[${i}]: no identity — one of [${idSlots}] must be authored`);
		const id = slugify(String(row[idSlot]));
		if (seen.has(id)) throw new Error(`${trail}[${i}]: ${idSlot} ${row[idSlot]} authored twice`);
		seen.add(id);
		const childNode = `${node}/${id}`;
		return {
			...childColumns(childClass, row, { node: childNode, trail: `${trail}[${i}]`, root }),
			...(ordered ? { ordinal: i + 1 } : {}),
			node: childNode,
			...(child.slots?.includes('about') ? { about: node } : {}),
			$trail: `${trail}[${i}]`,
		};
	});
}

/** the map form — the key IS a column value (content: {en: …} → Content rows) */
function keyedChildren(
	childClass: string,
	value: unknown,
	ctx: { node: string; trail: string; root: string },
): Row[] {
	const { node, trail, root } = ctx;
	const child = classByName[childClass]!;
	const keyedBy = child.annotations?.keyed_by;
	if (!keyedBy) throw new Error(`${trail}: ${childClass} has no keyed_by annotation`);
	const keyed = authoredKeyed(value, keyedBy, trail);
	const ordered = child.slots?.includes('ordinal');
	const keyDefault = child.annotations?.key_default as string | undefined; // slot ← key when unauthored
	return Object.entries(keyed).map(([k, payload], i) => {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload))
			throw new Error(`${trail}.${k}: expected a map of columns`);
		// `_` is a node segment in its own right (docs/parts.md) — slugify would
		// eat it, leaving an empty leaf
		const childNode = `${node}/${k === '_' ? '_' : slugify(k)}`;
		const expanded = childColumns(childClass, payload as Record<string, unknown>, {
			node: childNode,
			trail: `${trail}.${k}`,
			root,
		});
		if (keyDefault && !(keyDefault in expanded))
			expanded[keyDefault] = keyValue(keyDefault, k, trail);
		return {
			...expanded,
			...(ordered ? { ordinal: i + 1 } : {}),
			// the map key is the raw id column; its node segment is slugified —
			// idempotent on a key that already is a slug, kebabs a wire label
			// (V, SER#), which no permalink survives verbatim
			node: childNode,
			...(child.slots?.includes('about') ? { about: node } : {}),
			...(child.slots?.includes(keyedBy)
				? { [keyedBy]: inDoc(keyedBy) ? `${root}/${k}` : keyValue(keyedBy, k, `${trail}.${k}`) }
				: {}),
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
			for (const childRow of keyedChildren(childClass, value, {
				node,
				trail: `${slug}.${key}`,
				root: node,
			}))
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
