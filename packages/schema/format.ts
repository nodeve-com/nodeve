// Authored-yaml formatter: the SEMANTIC passes only — alpha-sort enums, sort
// slots by kind on the linkml schema, band-sugar desugar on data. Content-
// agnostic styling (deterministic flow/block collection style) is NOT here; it
// happens on every save in io.dumpYaml, so a generated file gets it too. `dumpYaml`
// applies it — this gate only reorders/desugars, then re-serializes. `--check`
// exits 1 on drift; default writes.
import { glob, parseDoc, read, write } from './src/io.ts';
import { dumpYaml } from './src/yaml-style.ts';
import { visit, isMap, type Document, type Pair, type Scalar, type YAMLMap } from 'yaml';

// linkml schema files take the sort passes; authored data yaml takes the
// desugar. Both re-serialize through io.dumpYaml, which owns collection style —
// prettier ignores all of packages/schema/**/*.yaml.
const SCHEMA_FILES = glob('linkml/*.yaml');
const DATA_FILES = glob('data/**/*.yaml');
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

/** desugar: relative-band sugar in authored data — `fraction_lower` /
 * `fraction_upper` in a valued_range payload rewrite to `margin_lower` /
 * `margin_upper` (features.yaml), so the normalizer only sees canonical band
 * columns. */
const BAND_SUGAR: Record<string, string> = {
	fraction_lower: 'margin_lower',
	fraction_upper: 'margin_upper',
};
function desugarBands(doc: Document) {
	visit(doc, {
		Pair(_key, pair) {
			if ((pair.key as Scalar)?.value !== 'valued_range' || !isMap(pair.value)) return;
			for (const p of (pair.value as YAMLMap).items) {
				const k = p.key as Scalar<string>;
				const mapped = BAND_SUGAR[k.value];
				if (mapped) k.value = mapped;
			}
		},
	});
}

// ─── cli ─────────────────────────────────────────────────────────────────────

const ALL_FILES = [...SCHEMA_FILES, ...DATA_FILES];
const isSchema = new Set(SCHEMA_FILES);
const sourceByFile = new Map(ALL_FILES.map((file) => [file, read(file)]));
const docByFile = new Map([...sourceByFile].map(([file, source]) => [file, parseDoc(source)]));
for (const [file, doc] of docByFile) {
	if (doc.errors.length) {
		console.error(doc.errors.map((e) => e.message).join('\n'));
		process.exit(2);
	}
	if (isSchema.has(file)) {
		sortEnums(doc);
		sortSlots(doc);
	} else {
		desugarBands(doc);
	}
}

const outputs: Array<[string, string, string]> = [...docByFile].map(
	([file, doc]) => [file, sourceByFile.get(file)!, dumpYaml(doc)] as [string, string, string],
);
const dirty = outputs.filter(([, before, after]) => before !== after);
if (!dirty.length) process.exit(0);
if (process.argv.includes('--check')) {
	for (const [file] of dirty)
		console.error(`${file} not formatted — run: node packages/schema/format.ts`);
	process.exit(1);
}
for (const [file, , after] of dirty) {
	write(file, after);
	console.log(`formatted ${file}`);
}
