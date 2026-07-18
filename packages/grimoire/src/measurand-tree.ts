// The shape of a device's SPECIFICATION measurand tree — the structural grammar shared by the two
// sides of the sensor-id contract: `generate-site.ts` (WRITES a sparse slug patch mirroring the
// tree) and `site-view.ts` (READS the merged tree back into a flat sensor list). One definition of
// "what a measurand feature looks like" so the writer and reader can't drift.
//
// A feature node is a measurand feature when every key is either a STRUCTURAL slot (how the feature
// is instanced) or a quantity_kind column (a measured quantity). A column node carries the measurand
// metadata (intervals / si_unit …). One column can hold SEVERAL sensor CHANNELS — its `measurable`
// intervals, each keyed by flow_direction/period (energy: yield-out vs input-in, lifetime vs daily) —
// so the sensor slug plants on the CHANNEL (the measurable interval), not the column.

import quantityKinds from './generated/enumeration/quantity_kind.ts';
import { isPlainObject } from 'remeda';

export type Obj = Record<string, unknown>;

// The trees here are the CAMEL generated device grain (loadDevice / the emitted TS catalog), so
// column keys are the camelCase dict keys; each member's authoritative snake `code` is the on-bus
// spelling ids/coordinates carry. One map holds both: camel key → wire code.
const QUANTITY_KIND_CODE = new Map<string, string>(
	Object.entries(quantityKinds).map(([k, t]) => [k, t.code]),
);

/** Is this feature node a measurand feature — does it carry a `featureSpec` spec body (the
 *  {combined, part, instances} breakdown of its quantity columns)? */
export const isMeasurandFeature = (node: unknown): node is Obj =>
	isPlainObject(node) && isPlainObject(node.featureSpec);

/** The quantity-kind keys directly on a node (its measured-quantity columns) — the CAMEL tree keys. */
export const quantityCols = (node: Obj): string[] =>
	Object.keys(node).filter((k) => QUANTITY_KIND_CODE.has(k));

/** A column key's wire `code` — the snake on-bus spelling every id/coordinate carries. */
export const quantityCode = (camelKey: string): string => QUANTITY_KIND_CODE.get(camelKey) ?? camelKey;

/** A camel tree key's snake wire spelling (feature keys camelize their authored slug). */
export const snakeKey = (camelKey: string): string =>
	camelKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// Where a channel's deterministic on-bus id lives: the `identity.slug` handle of its node
// (archetypes/specification composes the `identity` feature). For a channel it's the measurable
// interval node; for a column with no measurable interval it's the column node. The writer
// (generate-site bakes the patch) and the reader (site-view reads it back) BOTH go through these,
// so the location is defined ONCE here — change the id slot, change it here.
/** Build the sparse patch that plants a channel's baked slugs at its id handle: the SCOPED `slug`
 *  (device-local, for a producer that already namespaces) + the QUALIFIED `slug_qualified`
 *  (instance-prefixed, globally unique — HA's entity id). */
export const specSlugPatch = (slug: string, slugQualified: string): Obj => ({
	identity: { slug, slugQualified },
});
const idString = (node: Obj, key: 'slug' | 'slugQualified'): string | undefined =>
	isPlainObject(node.identity) && typeof node.identity[key] === 'string'
		? (node.identity[key] as string)
		: undefined;
/** Read a channel node's baked SCOPED slug back from its id handle (undefined if unbaked). */
export const specSlug = (node: Obj): string | undefined => idString(node, 'slug');
/** Read a channel node's baked QUALIFIED slug back from its id handle (undefined if unbaked). */
export const specSlugQualified = (node: Obj): string | undefined => idString(node, 'slugQualified');

/** One measured column located in the tree: its feature, its instance coordinate (`combined` → both
 *  absent; `part` → partId; `instances` → 1-based ordinal), its quantity_kind, and the column node. */
export interface MeasurandColumn {
	feature: string;
	partId?: string;
	ordinal?: number;
	quantityKind: string;
	node: Obj; // the column node (carries the `intervals` list)
}

/** One sensor CHANNEL: a column's coordinate PLUS, for a channel carried by a measurable interval,
 *  its channel `interval` slug (the by-slug handle a register FK names — `out` / `out_daily` / …,
 *  auto-slugged from the interval's flow_direction/period) and that interval node. A column with no
 *  measurable interval yields one channel at the column node (interval undefined) — prior single-cell
 *  behaviour, as does the one undirected/lifetime measurable channel (a slugless interval). */
export interface MeasurandCell {
	feature: string;
	partId?: string;
	ordinal?: number;
	quantityKind: string;
	interval?: string;
	node: Obj; // the measurable interval node, or the column node when the column has none
}

// A row's band body — `{ interval: {...} }` nested (the authored shape) or the row itself flat.
const bandOf = (row: Obj): Obj => (isPlainObject(row.interval) ? (row.interval as Obj) : row);

/** Is this interval row a `measurable` band — an instrument-readable span, i.e. one sensor channel? */
export const isMeasurableInterval = (row: unknown): row is Obj =>
	isPlainObject(row) && bandOf(row).intervalKind === 'measurable';

/** A column's measurable interval rows — each is its own sensor channel. */
const measurableRows = (column: Obj): Obj[] =>
	(Array.isArray(column.intervals) ? (column.intervals as unknown[]) : []).filter(isMeasurableInterval);

/** Walk a device tree and yield every measurand column with its coordinates — the flat view the
 *  patch's nested `{feature}.{combined|part.<id>|instances[n]}.{quantity_kind}` mirrors. */
export function measurandColumns(device: Obj): MeasurandColumn[] {
	const cols: MeasurandColumn[] = [];
	for (const [featureKey, node] of Object.entries(device)) {
		if (!isMeasurandFeature(node)) continue;
		const feature = snakeKey(featureKey); // cols carry the snake wire spelling, like every coordinate
		const fs = node.featureSpec as Obj;
		const push = (src: Obj, coord: { partId?: string; ordinal?: number }): void => {
			for (const col of quantityCols(src))
				cols.push({ feature, quantityKind: quantityCode(col), node: src[col] as Obj, ...coord });
		};
		if (isPlainObject(fs.combined)) push(fs.combined, {}); // the whole / aggregate (incl. a single spec feature's columns)
		if (isPlainObject(fs.part))
			for (const [partId, p] of Object.entries(fs.part as Obj)) push(p as Obj, { partId });
		if (Array.isArray(fs.instances))
			(fs.instances as Obj[]).forEach((inst, i) => push(inst, { ordinal: i + 1 }));
	}
	return cols;
}

/** Every sensor CHANNEL of a device — one per measurable interval of each column (carrying that
 *  interval's channel slug + node), or one at the column node when a column has no measurable
 *  interval. The channel slug is the interval's `identity.slug` handle (`out` / `out_daily` / … on the
 *  raw catalog device). The flat, slug-bearing view generate-site plants and site-view reads. */
export function measurandCells(device: Obj): MeasurandCell[] {
	return measurandColumns(device).flatMap((col) => {
		const rows = measurableRows(col.node);
		if (rows.length === 0) return [{ ...col }]; // no measurable interval — one channel at the column node
		return rows.map((row) => ({
			feature: col.feature,
			partId: col.partId,
			ordinal: col.ordinal,
			quantityKind: col.quantityKind,
			interval: specSlug(row), // the channel handle (undefined for the one undirected/lifetime channel)
			node: row,
		}));
	});
}

/** The key a gateway publishes a measurand channel under in its grouped `state` JSON — the `/`-joined
 *  coordinate `<feature>/<part|ordinal>/<quantity_kind>/<interval?>`, canonical feature (pre-alias,
 *  matching what the wire actually carries). The counterpart of the gateway's register→sub-topic
 *  derivation, so a downstream bus reader derives the key HERE, never hand-spells it. */
export const measurandSubTopic = (
	cell: Pick<MeasurandCell, 'feature' | 'partId' | 'ordinal' | 'quantityKind' | 'interval'>,
): string =>
	[cell.feature, cell.partId ?? cell.ordinal?.toString(), cell.quantityKind, cell.interval]
		.filter(Boolean)
		.join('/');
