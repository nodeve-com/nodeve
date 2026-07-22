// Semantic sort passes for the linkml schema yaml: enums alpha, slots by kind
// (scalar-valued then object-valued, each alpha). Data canonicalize lives in
// format-data.ts; collection style in io.dumpYaml. Pure doc mutation — no I/O.
import { isMap, type Document, type Pair, type Scalar, type YAMLMap } from 'yaml';

type MapPair = Pair<Scalar<string>, YAMLMap>;
const keyOf = (p: MapPair) => p.key.value;

function mapAt(doc: Document, path: string[]): YAMLMap | undefined {
	const node = doc.getIn(path);
	return isMap(node) ? (node as YAMLMap) : undefined;
}

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

/** schema yaml → sorted enums + slots, in place. */
export function formatSchema(doc: Document): void {
	sortEnums(doc);
	sortSlots(doc);
}
