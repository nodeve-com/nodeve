// Authored-yaml formatter: sort + desugar passes on the linkml schema, a
// deterministic flow/block restyle on every schema + data file. The sole style
// authority (prettier ignores packages/schema/**/*.yaml). Runs over a
// comment-preserving yaml Document. `--check` exits 1 on drift; default writes.
import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	parseDocument,
	visit,
	stringify,
	isMap,
	isPair,
	isCollection,
	type Pair,
	type Scalar,
	type YAMLMap,
	type YAMLSeq,
	type Node,
} from 'yaml';

const abs = (pattern: string) =>
	globSync(pattern, { cwd: fileURLToPath(new URL('.', import.meta.url)) }).map((p) =>
		fileURLToPath(new URL(p, import.meta.url)),
	);
// linkml schema files take the sort/desugar passes; authored data yaml takes
// only the deterministic restyle. Both are the sole style authority for their
// tree — prettier ignores all of packages/schema/**/*.yaml.
const SCHEMA_FILES = abs('linkml/*.yaml');
const DATA_FILES = abs('data/**/*.yaml');
type MapPair = Pair<Scalar<string>, YAMLMap>;

const keyOf = (p: MapPair) => p.key.value;

function mapAt(doc: Document, path: string[]): YAMLMap | undefined {
	const node = doc.getIn(path);
	return isMap(node) ? (node as YAMLMap) : undefined;
}

// ─── passes ──────────────────────────────────────────────────────────────────

/** enums sort alpha. permissible_values stay authored — order is often semantic
 * (Severity best→fatal). */
function sortEnums(doc: Document) {
	const enums = mapAt(doc, ['enums']);
	enums?.items.sort((a, b) => keyOf(a as MapPair).localeCompare(keyOf(b as MapPair)));
}

/** slots sort: scalar-valued alpha, then object-valued (range is a class) alpha.
 * The object-group banner comment is re-anchored to whichever key lands first. */
function sortSlots(doc: Document) {
	const slots = mapAt(doc, ['slots']);
	if (!slots) return;
	const enumNames = new Set(mapAt(doc, ['enums'])?.items.map((p) => keyOf(p as MapPair)));
	const isObjectValued = (p: MapPair) => {
		const range = p.value?.get('range');
		return typeof range === 'string' && /^[A-Z]/.test(range) && !enumNames.has(range);
	};

	// detach the group banner so it doesn't ride an arbitrary key through the sort
	const banner = slots.items
		.map((p) => (p as MapPair).key)
		.find((k) => k.commentBefore?.includes('object-valued slots'));
	const bannerText = banner?.commentBefore;
	if (banner) delete banner.commentBefore;

	slots.items.sort((a, b) => {
		const [pa, pb] = [a as MapPair, b as MapPair];
		return (
			Number(isObjectValued(pa)) - Number(isObjectValued(pb)) || keyOf(pa).localeCompare(keyOf(pb))
		);
	});

	const firstObject = slots.items.find((p) => isObjectValued(p as MapPair)) as MapPair | undefined;
	if (bannerText && firstObject) firstObject.key.commentBefore = bannerText;
}

/** desugar: camel annotation is mechanical from the snake key — authors omit it,
 * the formatter injects it. */
function injectCamel(doc: Document) {
	const slots = mapAt(doc, ['slots']);
	if (!slots) return;
	for (const item of slots.items) {
		const p = item as MapPair;
		const name = keyOf(p);
		if (!name.includes('_')) continue;
		if (p.value?.hasIn(['annotations', 'camel'])) continue;
		const camel = name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
		p.value.set('annotations', doc.createNode({ camel: camel }, { flow: true }));
	}
}

/** Deterministic collection style: a map/seq stays inline flow only if its
 * one-line render fits the width budget AND holds no block child or comment;
 * otherwise it becomes block. Replaces prettier's multiline-flow — the lone `{`
 * / `}` lines a long flow map wraps into. Bottom-up: a child forced block forces
 * its parent block, since a flow collection cannot hold a block one. */
const WIDTH = 100;
type Coll = YAMLMap | YAMLSeq;
const hasComment = (n: unknown): boolean => {
	const c = n as { comment?: unknown; commentBefore?: unknown } | null;
	return Boolean(c?.comment || c?.commentBefore);
};
function restyle(doc: Document) {
	const found: Array<{ node: Coll; depth: number; prefix: number }> = [];
	visit(doc, {
		Collection(_key, node, path) {
			const parent = path[path.length - 1] as Node;
			// column budget already spent before this collection opens: its own indent
			// plus the `key: ` (map value) or `- ` (seq item) that precedes it
			const prefix = isPair(parent) ? String((parent.key as Scalar).value).length + 2 : 2;
			found.push({ node: node as Coll, depth: path.filter(isCollection).length, prefix });
		},
	});
	found.sort((a, b) => b.depth - a.depth); // deepest first
	for (const { node, depth, prefix } of found) {
		const commented = node.items.some((it) =>
			isPair(it) ? hasComment(it.key) || hasComment(it.value) || hasComment(it) : hasComment(it),
		);
		const blockChild = node.items.some((it) => {
			const child = isPair(it) ? it.value : it;
			return isCollection(child) && child.flow === false;
		});
		if (commented || blockChild) {
			node.flow = false;
			continue;
		}
		node.flow = true;
		const width = depth * 2 + prefix + stringify(node, { lineWidth: 0 }).trimEnd().length;
		node.flow = width <= WIDTH;
	}
}

// ─── cli ─────────────────────────────────────────────────────────────────────

const ALL_FILES = [...SCHEMA_FILES, ...DATA_FILES];
const isSchema = new Set(SCHEMA_FILES);
const sourceByFile = new Map(ALL_FILES.map((file) => [file, readFileSync(file, 'utf8')]));
const docByFile = new Map([...sourceByFile].map(([file, source]) => [file, parseDocument(source)]));
for (const [file, doc] of docByFile) {
	if (doc.errors.length) {
		console.error(doc.errors.map((e) => e.message).join('\n'));
		process.exit(2);
	}
	if (isSchema.has(file)) {
		sortEnums(doc);
		sortSlots(doc);
		injectCamel(doc);
	}
	restyle(doc);
}

const outputs: Array<[string, string, string]> = [...docByFile].map(
	([file, doc]) =>
		[file, sourceByFile.get(file)!, doc.toString({ lineWidth: 0 })] as [string, string, string],
);
const dirty = outputs.filter(([, before, after]) => before !== after);
if (!dirty.length) process.exit(0);
if (process.argv.includes('--check')) {
	for (const [file] of dirty)
		console.error(`${file} not formatted — run: node packages/schema/format.ts`);
	process.exit(1);
}
for (const [file, , after] of dirty) {
	writeFileSync(file, after);
	console.log(`formatted ${file}`);
}
