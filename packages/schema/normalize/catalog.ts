// Destructure authored data/ docs into gen/catalog.json — the root object
// linkml-sqldb loads. The disk walk + bundle assembly half; the pure doc→rows
// normalizer lives in normalize.ts.
//
//   node normalize/catalog.ts                        build the catalog
//   node normalize/catalog.ts data/registry/x.yaml   print one doc's rows (debug)
//
// Everything is read from the schema, never hardcoded: each Catalog slot names a
// class (range) whose data dir is its sql_table. A file the normalizer rejects
// is SKIPPED LOUDLY, never silently dropped.
import { shortCode } from '@nodeve/encoding/short-code';
import { abs, dirents, dumpJson, exists, readYaml, write } from '../src/io.ts';
import { classByName, classByTable, seg, type SlotDef, slotByName } from './model.ts';
import { normalize, nodeAttrMap, type Row } from './normalize.ts';
import { normalizeDevice } from './tree.ts';

// ─── catalog build (only as the entrypoint — importers get normalize alone) ──

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

function mintNodes(): unknown[] {
	const seen = new Set<string>();
	for (const path of paths) {
		if (seen.has(path)) throw new Error(`duplicate node path: node:${path}`);
		seen.add(path);
	}
	return [...seen].sort().map((path) => {
		const permalink = `node:${path}`;
		const segs = path.split('/');
		return {
			permalink,
			code: shortCode(permalink),
			node_type: `node:node-type/${segs[0]}`,
			slug: segs[segs.length - 1],
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

/** one data dir → its catalog rows: authored files normalized, legacy passed through */
function tableRows(dir: string): unknown[] {
	const out: unknown[] = [];
	// a Catalog collection with no authored docs yet (e.g. node_edge) → empty
	if (!exists(abs(`data/${dir}`))) return out;
	const nested = classByName[classByTable[dir] ?? '']?.annotations?.path_root;
	// a tree-walked entry may be a DIRECTORY (its name the slug, its children
	// merged at load); flat tables stay one file per row
	const entries = dirents(abs(`data/${dir}`)).filter(
		(e) => e.name.endsWith('.yaml') || (nested && e.isDirectory()),
	);
	for (const e of entries.map((e) => e.name).sort()) {
		if (nested) {
			const model = normalizeDevice(abs(`data/${dir}/${e}`), (p) => paths.push(p));
			liftContent(model); // pull nested Content out of the device tree, top-level
			out.push(model);
			continue;
		}
		const doc = (readYaml(abs(`data/${dir}/${e}`)) ?? {}) as Record<string, unknown>;
		if (typeof doc.node === 'string') {
			collectPaths(doc, [doc.node.replace(/^node:/, '').split('/')[0]!]);
			out.push(doc);
		} else out.push(assemble(normalize(abs(`data/${dir}/${e}`))));
	}
	return out;
}

/** slots with a user-facing title project to Property rows, one Content row per
 * language. EVERYTHING is read from the schema — no data/ sidecar. en Content:
 * `title` ← slot `title`, `lede` ← slot `description`. Every translation and any
 * en `body` rides `annotations.i18n.value.<field ∈ {title,lede,body}>.<lang>`
 * on the slot. A title-less slot is structural and gets no row. */
function propertyContents(node: string, def: SlotDef): Record<string, unknown>[] {
	const i18n = def.annotations?.i18n?.value ?? {};
	const langs = new Set<string>(['en']); // en first, deterministic
	for (const byLang of Object.values(i18n)) for (const lang of Object.keys(byLang)) langs.add(lang);

	return [...langs].map((lang) => {
		const row: Record<string, unknown> = { node: `${node}/${lang}`, about: node, language: lang };
		if (lang === 'en') {
			row.title = def.title;
			if (def.description !== undefined) row.lede = def.description;
		} else {
			if (i18n.title?.[lang] !== undefined) row.title = i18n.title[lang];
			if (i18n.lede?.[lang] !== undefined) row.lede = i18n.lede[lang];
		}
		if (i18n.body?.[lang] !== undefined) row.body = i18n.body[lang];
		return row;
	});
}

function projectProperties(): unknown[] {
	const rows: unknown[] = [];
	for (const [name, def] of Object.entries(slotByName)) {
		if (!def.title) continue;
		const slug = seg(name);
		const node = `node:property/${slug}`;
		const contents = propertyContents(node, def);
		paths.push(
			`property/${slug}`,
			...contents.map((c) => (c.node as string).replace(/^node:/, '')),
		);
		contentRows.push(...contents);
		rows.push({ node });
	}
	return rows;
}

function build() {
	const container = classByName.Catalog?.attributes as
		Record<string, { range: string }> | undefined;
	if (!container) throw new Error('nodeve.yaml: no Catalog container class');

	const bundle: Record<string, unknown[]> = {};
	for (const [slot, { range }] of Object.entries(container)) {
		if (range === 'Node') continue; // derived below, no data dir
		if (range === 'Content') continue; // accumulated during the pass, filled below
		if (range === 'Property') {
			bundle[slot] = projectProperties();
			continue;
		} // schema, not data
		const dir = classByName[range]?.annotations?.sql_table;
		if (!dir) throw new Error(`Catalog.${slot}: range ${range} has no sql_table annotation`);
		bundle[slot] = tableRows(dir);
	}

	bundle.nodes = mintNodes();
	// content rows fell out of every doc + projectProperties into contentRows;
	// emit them under the Catalog slot ranging Content, sorted for determinism
	const contentSlot = Object.entries(container).find(([, a]) => a.range === 'Content')?.[0];
	if (contentSlot)
		bundle[contentSlot] = contentRows.sort((a, b) => String(a.node).localeCompare(String(b.node)));

	write(abs('gen/catalog.json'), dumpJson(bundle));
	console.log(
		Object.entries(bundle)
			.map(([k, v]) => `${v.length} ${k}`)
			.join(', ') + ' → gen/catalog.json',
	);
}

if (import.meta.main && process.argv[2]) {
	console.log(dumpJson(normalize(process.argv[2]), 2));
} else if (import.meta.main) {
	build();
}
