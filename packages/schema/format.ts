// LinkML schema formatter: sort + desugar passes over a comment-preserving
// yaml Document. `--check` exits 1 on drift (gate mode); default writes.
import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDocument, isMap, type Pair, type Scalar, type YAMLMap } from 'yaml';

const SCHEMA_FILES = globSync('linkml/*.yaml', {
	cwd: fileURLToPath(new URL('.', import.meta.url)),
}).map((p) => fileURLToPath(new URL(p, import.meta.url)));
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

// ─── cli ─────────────────────────────────────────────────────────────────────

const sourceByFile = new Map(SCHEMA_FILES.map((file) => [file, readFileSync(file, 'utf8')]));
const docByFile = new Map([...sourceByFile].map(([file, source]) => [file, parseDocument(source)]));
for (const doc of docByFile.values()) {
	if (doc.errors.length) {
		console.error(doc.errors.map((e) => e.message).join('\n'));
		process.exit(2);
	}
	sortEnums(doc);
	sortSlots(doc);
	injectCamel(doc);
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
