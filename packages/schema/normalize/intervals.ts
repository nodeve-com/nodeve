// Lowering a feature's band map into interval rows + their facets (valued_range,
// measurement, specification, content). Split from tree.ts; operates on the
// DeviceWalk through the IntervalHost interface. Vocabularies come from the
// schema/data rows, never hardcoded — facet keys resolve to classes by sql_table.
import { classByTable, fkTable, keysOf, seg, slotByName } from './model.ts';
import { components, earns } from './slug.ts';
import { coRow, columns, die, expandKey, isMap, type Doc } from './registers.ts';
import type { ValueContracts } from './values.ts';

/** one authored feature in flight — trail, vocabularies, accumulated rows */
export type FeatureCtx = {
	trail: string;
	ftSlug: string;
	fNode: string;
	kinds: Set<string>;
	members?: string[];
	count?: number;
	/** the roster — every subdivision this feature HAS, in authored order. `count`
	 * fills it 1…n; a part_set feature earns it by naming parts. `*` expands over
	 * THIS, never over the part_set vocabulary. */
	roster: Set<string>;
	/** a `*` key was authored — checked against the roster once the walk ends */
	starred?: boolean;
	feature: Doc;
	list: { intervals: Doc[]; specifications: Doc[]; measurements: Doc[]; filters: Doc[] };
};

/** the DeviceWalk primitives the interval lowering reaches back for */
export interface IntervalHost {
	mint(p: string): string;
	readonly intervals: Set<string>;
	readonly measurable: Set<string>;
	readonly values: ValueContracts;
	childRows(cls: string, value: unknown, at: { trail: string; parent?: string }): Doc[];
}

/** host + feature-in-flight — the pair every step threads */
type Walk = { host: IntervalHost; ctx: FeatureCtx };

/** one quantity's band map → its interval rows */
export function quantity(w: Walk, at: { part: string; quantity: string }, bandMap: unknown) {
	if (!isMap(bandMap)) die(`${w.ctx.trail}.${at.part}.${at.quantity}`, 'expected interval slugs');
	for (const [raw, payload] of Object.entries(bandMap))
		intervalRow(w, { ...at, islug: String(raw) }, payload);
}

function intervalRow(
	w: Walk,
	at: { part: string; quantity: string; islug: string },
	payload: unknown,
) {
	const { host, ctx } = w;
	const trail = `${ctx.trail}.${at.part}.${at.quantity}.${at.islug}`;
	const iNode = `${ctx.fNode}/${at.part}/${at.quantity}/${at.islug}`;
	if (host.intervals.has(iNode)) die(trail, 'duplicate coordinate');
	host.intervals.add(iNode);
	host.mint(iNode);
	// three stacked authored levels → part/quantity columns; the interval slug rides the node
	const [partSlot, qkSlot] = keysOf('Interval') as [string, string, string];
	const row: Doc = { node: iNode, [partSlot]: at.part, [qkSlot]: expandKey(qkSlot, at.quantity) };
	if (!isMap(payload)) die(trail, 'expected facet keys');
	const facetByTable: Record<string, Doc> = {};
	for (const [facet, cols] of Object.entries(payload))
		facetCol(w, { row, facet, facetByTable, trail: `${trail}.${facet}` }, cols);
	// the slug names what the facets set — no invented words, no restating the facet
	const words = components(facetByTable);
	if (!earns(at.islug, words))
		die(trail, `slug must join these in order: [${words.join(', ') || 'nothing — use `_`'}]`);
	ctx.list.intervals.push(row);
}

/** a named facet key — a co-row sharing the interval's node */
function facetCol(
	w: Walk,
	at: { row: Doc; facet: string; facetByTable: Record<string, Doc>; trail: string },
	cols: unknown,
) {
	const { host, ctx } = w;
	const cls = classByTable[at.facet] ?? die(at.trail, 'not a facet');
	const iNode = at.row.node as string;
	if (at.facet === 'valued_range') {
		at.row.valued_range = coRow(cls, { node: iNode, trail: at.trail }, cols);
	} else if (at.facet === 'measurement') {
		const measurement = { node: iNode, ...columns(cls, cols, at.trail) };
		at.facetByTable[at.facet] = measurement;
		ctx.list.measurements.push(measurement);
		host.measurable.add(iNode);
	} else if (at.facet === 'filter') {
		// conditioning, not identity — it never reaches facetByTable, so it earns
		// the band no slug word (Filter declares no `discriminates`)
		ctx.list.filters.push({ node: iNode, ...columns(cls, cols, at.trail) });
	} else if (at.facet === 'specification') {
		const spec = specification(host, { node: iNode, cls, trail: at.trail }, cols);
		at.facetByTable[at.facet] = spec;
		ctx.list.specifications.push(spec);
	} else if (at.facet === 'content')
		// an identified band names a device state → its own prose, hoisted by liftContent
		at.row.contents = host.childRows(cls, cols, { trail: at.trail, parent: iNode });
	else die(at.trail, `${cls} is not an interval facet`);
}

/** specification facet — an inlined_as_list slot (schema fact) lowers each entry to a child row (list = AND) */
function specification(
	host: IntervalHost,
	at: { node: string; cls: string; trail: string },
	payload: unknown,
): Doc {
	if (!isMap(payload)) die(at.trail, 'expected a map of columns');
	const row: Doc = { node: at.node };
	const cols: Doc = {};
	for (const [k, v] of Object.entries(payload)) {
		const table = slotByName[k]?.inlined_as_list ? fkTable(k) : undefined;
		if (!table) cols[k] = v;
		else if (!Array.isArray(v) || !v.length) die(`${at.trail}.${k}`, 'expected a non-empty list');
		else
			row[k] = v.map((g, i) => {
				const node = host.mint(`${at.node}/${seg(table)}/${i + 1}`);
				return host.values.gate({ node, trail: `${at.trail}.${k}[${i}]` }, g);
			});
	}
	return Object.assign(row, columns(at.cls, cols, at.trail));
}
