// Destructure an authored tree into the catalog bundle — the root object
// src/load.ts ingests. The disk walk + bundle assembly half; the pure doc→rows
// normalizer lives in normalize.ts. src/cli.ts is the command line over it.
//
// The tree root is a PARAMETER: this package walks its own data/, a downstream
// consumer walks sites/<name>/catalog/ and concatenates the two bundles. Inside
// the root, everything is read from the schema, never hardcoded: each Catalog
// slot names a class (range) whose dir is its sql_table. A file the normalizer
// rejects is SKIPPED LOUDLY, never silently dropped.
import { join } from 'node:path';
import { shortCode } from '@nodeve/encoding/short-code';
import { dirents, exists, readYaml } from '../src/io.ts';
import type { Bundle, TableRow } from '../src/load.ts';
import { classByName, classByTable, seg, slotByName } from './model.ts';
import { normalize, normalizeDoc, nodeAttrMap, type Row } from './normalize.ts';
import { projectProperties } from './properties.ts';
import { normalizeDevice } from './tree.ts';

/** the schema-projected Property row-set, feeding this pass's accumulators */
function properties(): TableRow[] {
	const { rows, contents, paths: minted } = projectProperties();
	paths.push(...minted);
	contentRows.push(...contents);
	return rows;
}

// ─── pass accumulators — buildCatalog() clears them, so a second walk in the
// same process (downstream tree after this one) starts empty ────────────────

const paths: string[] = [];

// the universal Content facet is one top-level row-set keyed by `about` — the
// global multivalued slot ranging Content names the bucket; Catalog mirrors it.
// Content rows accumulate here across the whole pass, never nest under a parent.
const CONTENT_SLOT = Object.keys(slotByName).find(
	(s) => slotByName[s]?.range === 'Content' && slotByName[s]?.multivalued,
);
const contentRows: Record<string, unknown>[] = [];

/** drop the $-tags — they are source bookkeeping, never catalog columns */
const strip = (row: Row): Record<string, unknown> =>
	Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('$')));

/** flat rows → one nested storage row; every node feeds the id space */
function assemble(rows: Row[]): Record<string, unknown> {
	for (const row of rows) paths.push((row.node as string).replace(/^node:/, ''));
	const [root, ...children] = rows as [Row, ...Row[]];
	const nested = strip(root);
	for (const child of children) {
		// the universal Content facet lifts to the top-level row-set (keyed by
		// `about`), never nests under the row it describes
		if (child.$slot === CONTENT_SLOT) contentRows.push(strip(child));
		else ((nested[child.$slot!] ??= []) as unknown[]).push(strip(child));
	}
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

// ─── node rows ───────────────────────────────────────────────────────────────
// The id space, DERIVED — where a thing is authored already states its identity.
// permalink = the ancestor trail (docs/levels.md); code = shortCode(trail),
// a url shortener over the PK. The CURIE is hashed, never a url — domains are
// a deployment fact. node_type = the root segment (the kind), slug = the leaf
// (the local id) — both identity, derived from the same path, stored once here.

function mintNodes(): TableRow[] {
	const seen = new Set<string>();
	for (const path of paths) {
		if (seen.has(path)) throw new Error(`duplicate node path: node:${path}`);
		seen.add(path);
	}
	return [...seen].sort().map((path) => {
		const permalink = `node:${path}`;
		const segs = path.split('/');
		// parent = nearest ANCESTOR that is itself a node (the trail is not a clean
		// prefix tree — a feature is device/<ft>/<role>, the <ft> level is no node).
		// This self-FK carries device↔facet ancestry that the old subject_node hub did.
		let parent: string | undefined;
		for (let i = segs.length - 1; i > 0 && !parent; i--) {
			const anc = segs.slice(0, i).join('/');
			if (seen.has(anc)) parent = `node:${anc}`;
		}
		return {
			permalink,
			code: shortCode(permalink),
			node_type: `node:node-type/${segs[0]}`,
			slug: segs[segs.length - 1],
			...(parent ? { parent } : {}),
			...(nodeAttrMap.get(permalink) ?? {}),
		};
	});
}

/** the device walker nests Content wherever its parent sits; hoist every such
 * row to the top-level accumulator (keyed by `about`), same as the flat path */
function liftContent(o: unknown): void {
	if (Array.isArray(o)) return o.forEach(liftContent);
	if (!o || typeof o !== 'object') return;
	const row = o as Record<string, unknown>;
	if (CONTENT_SLOT && Array.isArray(row[CONTENT_SLOT])) {
		contentRows.push(...(row[CONTENT_SLOT] as Record<string, unknown>[]));
		delete row[CONTENT_SLOT];
	}
	Object.values(row).forEach(liftContent);
}

/** one flat data dir → its catalog rows: authored files normalized, legacy
 * passed through. Device dirs are NOT flat — they scatter via walkDevices. */
function tableRows(root: string, dir: string): TableRow[] {
	const out: TableRow[] = [];
	// a Catalog collection with no authored docs yet (e.g. node_edge) → empty
	if (!exists(join(root, dir))) return out;
	const entries = dirents(join(root, dir)).filter((e) => e.name.endsWith('.yaml'));
	for (const e of entries.map((e) => e.name).sort()) {
		const file = join(root, dir, e);
		const doc = (readYaml(file) ?? {}) as Record<string, unknown>;
		if (typeof doc.node === 'string') {
			collectPaths(doc, [doc.node.replace(/^node:/, '').split('/')[0]!]);
			out.push(doc);
		} else out.push(assemble(normalize(file)));
	}
	return out;
}

/** the device dir (data/subject_node) walked: each authored device fans out
 * into facet row-sets keyed by sql_table, a thin subject_node marker row, and
 * the shared register maps it references (deduped). Facets attach to the device
 * node directly — no container nesting — tied back by the node.parent trail.
 *
 * Two levels, mirroring the permalink: `<node_type>/<slug>`. The kind is the
 * directory, so nothing inside an entry restates its own position and one slug
 * may appear under two kinds (a site's inventory item and the adapter reading
 * it). Each leaf is one entry — a `<slug>.yaml` file, or a `<slug>/` dir whose
 * children merge. */
const DEVICE_DIR = 'subject_node';
type DeviceRows = { rowsByTable: Record<string, TableRow[]>; subjectNodes: TableRow[] };
function deviceFiles(root: string): string[] {
	const base = join(root, DEVICE_DIR);
	if (!exists(base)) return [];
	return dirents(base)
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort()
		.flatMap((kind) =>
			dirents(join(base, kind))
				.filter((e) => e.isDirectory() || e.name.endsWith('.yaml'))
				.map((e) => e.name)
				.sort()
				.map((entry) => join(base, kind, entry)),
		);
}
function walkDevices(root: string): DeviceRows {
	const rowsByTable: Record<string, TableRow[]> = {};
	const subjectNodes: TableRow[] = [];
	const seenMap = new Set<string>();
	const bucket = (table: string) => (rowsByTable[table] ??= []);
	for (const file of deviceFiles(root)) {
		const { node, model, registerMap } = normalizeDevice(file, (p) => paths.push(p));
		liftContent(model); // pull device + nested Content out, top-level (keyed by about)
		for (const [table, rows] of Object.entries(model))
			bucket(table).push(...((Array.isArray(rows) ? rows : [rows]) as TableRow[]));
		if (registerMap) {
			const mapNode = registerMap.node as string;
			if (!seenMap.has(mapNode)) {
				seenMap.add(mapNode);
				bucket('register_map').push(registerMap);
			}
			// the shared family map is a `reference` relation — paint it as a
			// NodeEdge (subject = device, predicate = the node_type's register_map
			// relation, object = the shared map), not a bespoke marker column.
			const nt = node.replace(/^node:/, '').split('/')[0];
			bucket('node_edge').push({
				subject: node,
				// the Facet relation node — the relation slug is kebabed in node paths
				predicate: `node:node-type/${nt}/${seg('register_map')}`,
				object: mapNode,
				position: 1,
			});
		}
		subjectNodes.push({ node });
	}
	return { rowsByTable, subjectNodes };
}

/** Every kind (root segment) in the id space needs a node_type row, or its
 * nodes' node_type FK dangles. Rich kinds with a distinctive facet composition
 * are authored in data/node_type/; the rest — kinds backed by a plain table
 * class — derive one minimal row here (a content facet, titled from the class),
 * so the two stub-only files don't have to be hand-kept. Runs after every other
 * dir so `paths` holds the full set of kinds. */
function buildNodeTypes(root: string, schemaRows: boolean): TableRow[] {
	const authored = tableRows(root, 'node_type'); // rich facet compositions (device kinds)
	if (!schemaRows) return authored; // the stubs are the schema's, and the seed carries them
	const authoredKinds = new Set(
		authored.map((r) =>
			String((r as Row).node)
				.split('/')
				.pop(),
		),
	);
	const kinds = new Set(paths.map((p) => p.split('/')[0]!));
	const derived = [...kinds]
		.filter((kind) => !authoredKinds.has(kind))
		.sort()
		.map((kind) => {
			const cls = classByName[classByTable[kind.replaceAll('-', '_')] ?? ''];
			if (!cls?.annotations?.sql_table)
				throw new Error(`node_type ${kind}: no authored file and no class with that sql_table`);
			if (!cls.title) throw new Error(`node_type ${kind}: class has no title to label the kind`);
			return assemble(normalizeDoc('node_type', kind, { content: { en: { title: cls.title } } }));
		});
	return [...authored, ...derived];
}

/** an authored tree → the catalog bundle: one row-set per Catalog slot, plus
 * the node rows the trail mints. `root` holds a dir per sql_table (data/ here,
 * sites/<name>/catalog/ downstream).
 *
 * `schemaRows` adds the row-sets projected from the SCHEMA rather than the tree
 * — Property rows and the derived node_type stubs. They are identical in every
 * tree, so ONLY the package owning the schema emits them; a downstream bundle
 * that re-emitted them would collide on the PK the moment it concatenated with
 * the shipped catalog. A downstream kind with no shipped node_type row authors
 * one in its own node_type/ dir; foreign_key_check names it if it forgets. */
export function buildCatalog(root: string, { schemaRows = false } = {}): Bundle {
	paths.length = 0;
	contentRows.length = 0;
	nodeAttrMap.clear();

	const container = classByName.Catalog?.attributes as
		Record<string, { range: string }> | undefined;
	if (!container) throw new Error('nodeve.yaml: no Catalog container class');

	// devices fan out first — their facet row-sets and marker rows fill the
	// slots that have no dir of their own (product, feature_of_interest, …)
	const devices = walkDevices(root);

	const bundle: Bundle = {};
	for (const [slot, { range }] of Object.entries(container)) {
		if (range === 'Node') continue; // derived below, no data dir
		if (range === 'Content') continue; // accumulated during the pass, filled below
		if (range === 'NodeType') continue; // authored + derived below, after all kinds known
		if (range === 'Property') {
			bundle[slot] = schemaRows ? properties() : [];
			continue;
		} // schema, not tree
		const dir = classByName[range]?.annotations?.sql_table;
		if (!dir) throw new Error(`Catalog.${slot}: range ${range} has no sql_table annotation`);
		if (dir === DEVICE_DIR)
			bundle[slot] = devices.subjectNodes; // thin markers
		else if (devices.rowsByTable[dir])
			bundle[slot] = devices.rowsByTable[dir]; // device-only facet
		else bundle[slot] = tableRows(root, dir);
	}

	const nodeTypeSlot = Object.entries(container).find(([, a]) => a.range === 'NodeType')?.[0];
	if (nodeTypeSlot) bundle[nodeTypeSlot] = buildNodeTypes(root, schemaRows);

	bundle.nodes = mintNodes();
	// content rows fell out of every doc + projectProperties into contentRows;
	// emit them under the Catalog slot ranging Content, sorted for determinism
	const contentSlot = Object.entries(container).find(([, a]) => a.range === 'Content')?.[0];
	if (contentSlot)
		bundle[contentSlot] = contentRows.sort((a, b) => String(a.node).localeCompare(String(b.node)));

	return bundle;
}
