// Lowering a feature's band map into interval rows + their facets (valued_range,
// measurement, specification, content). Split from tree.ts; operates on the
// DeviceWalk through the IntervalHost interface. Vocabularies come from the
// schema/data rows, never hardcoded — facet keys resolve to classes by sql_table.
import { classByTable, fkTable, keysOf, seg, slotByName, SLUG } from './model.ts';
import { columns, die, expandKey, isMap, type Doc } from './registers.ts';
import { expandValuedRange } from '../src/valued-range-expand.ts';
import type { ValuedRange } from '../gen/schema.ts';
import type { ValueContracts } from './values.ts';

/** one authored feature in flight — trail, vocabularies, accumulated rows */
export type FeatureCtx = {
	trail: string;
	ftSlug: string;
	fNode: string;
	kinds: Set<string>;
	members?: string[];
	count?: number;
	feature: Doc;
	list: { intervals: Doc[]; specifications: Doc[]; measurements: Doc[] };
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
	if (at.islug !== '_' && !SLUG.test(at.islug)) die(trail, 'not a slug or _');
	const iNode = `${ctx.fNode}/${at.part}/${at.quantity}/${at.islug}`;
	if (host.intervals.has(iNode)) die(trail, 'duplicate coordinate');
	host.intervals.add(iNode);
	host.mint(iNode);
	// three stacked authored levels → part/quantity columns; the interval slug rides the node
	const [partSlot, qkSlot] = keysOf('Interval') as [string, string, string];
	const row: Doc = { node: iNode, [partSlot]: at.part, [qkSlot]: expandKey(qkSlot, at.quantity) };
	if (!isMap(payload)) die(trail, 'expected facet keys');
	for (const [facet, cols] of Object.entries(payload))
		facetCol(w, { row, facet, trail: `${trail}.${facet}` }, cols);
	ctx.list.intervals.push(row);
}

/** a named facet key — a co-row sharing the interval's node */
function facetCol(w: Walk, at: { row: Doc; facet: string; trail: string }, cols: unknown) {
	const { host, ctx } = w;
	const cls = classByTable[at.facet] ?? die(at.trail, 'not a facet');
	const iNode = at.row.node as string;
	if (at.facet === 'valued_range') {
		const vr = isMap(cols) ? (cols as unknown as ValuedRange) : die(at.trail, 'expected columns');
		at.row.valued_range = {
			node: iNode,
			...columns(cls, expandValuedRange(vr, at.trail), at.trail),
		};
	} else if (at.facet === 'measurement') {
		ctx.list.measurements.push({ node: iNode, ...columns(cls, cols, at.trail) });
		host.measurable.add(iNode);
	} else if (at.facet === 'specification')
		ctx.list.specifications.push(specification(host, { node: iNode, cls, trail: at.trail }, cols));
	else if (at.facet === 'content')
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
