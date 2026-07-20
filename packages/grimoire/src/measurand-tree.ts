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
import type { IntervalItem } from './generated/property/interval_item.ts';
import { isPlainObject, toSnakeCase } from 'remeda';
import humps from 'remeda-humps';
import createHumps from 'remeda-humps/createHumps';

export type Obj = Record<string, unknown>;

// `catalog_patch` casing — keys only (values/slugs/codes untouched), the SAME snake .json ⇄ camel TS
// twin the whole catalog rides (kit/emit-catalog.ts: `humps` deep-camelizes the snake source). The
// patch is BUILT off the camel `loadDevice` grain, so the bake serializes it back to snake through
// `patchToWire` — one uniformly-snake bundle, no camel island — and every reader (site-view overlay,
// the bake's own interval-filter check) camelizes it back through `patchFromWire` before overlaying
// onto the camel device.
const decamelizeKeys = createHumps(toSnakeCase);
/** The camel `catalog_patch` in its snake wire spelling — what the bake writes into the bundle. */
export const patchToWire = (patch: Obj): Obj => decamelizeKeys(patch) as Obj;
/** A snake wire `catalog_patch` back in the camel device grain — what a reader overlays. */
export const patchFromWire = (patch: Obj): Obj => humps(patch) as Obj;

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
export const quantityCode = (camelKey: string): string =>
	QUANTITY_KIND_CODE.get(camelKey) ?? camelKey;

/** A camel tree key's snake wire spelling (feature keys camelize their authored slug). */
export const snakeKey = (camelKey: string): string =>
	camelKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// Two distinct slugs live on `identity` (archetypes/specification composes the `identity` feature),
// and keeping them separate is what lets the read-side overlay land the patch:
//   • `slug` — the interval's CHANNEL HANDLE, a raw-catalog fact (energy: out / out_daily / in / …;
//     undefined for an undirected single channel or a column node). It is the on-bus id TAIL and,
//     crucially, the key `overlayPatch` matches array elements by — so the bake must PRESERVE it,
//     never overwrite it with the computed sensor id, or a slugged base interval and its patch no
//     longer match and the patch appends beside it instead of merging onto it.
//   • `slug_qualified` — the QUALIFIED (instance-prefixed, globally unique) sensor id the bake
//     STAMPS. The SCOPED sensor id is this minus the instance prefix, so it isn't stored twice.
// The writer (bake-site) and reader (site-view) BOTH go through the helpers here, so the slot layout
// is defined ONCE — change it here.
/** Build the sparse patch that stamps a channel's baked QUALIFIED sensor id, keyed (for a slugged
 *  interval) by its channel `handle` so `overlayPatch` merges onto the right base element. A column
 *  node / undirected channel has no handle — the patch carries only the qualified id and merges
 *  positionally / by object key. */
export const specSlugPatch = (slugQualified: string, handle?: string): Obj => ({
	identity: { ...(handle !== undefined ? { slug: handle } : {}), slugQualified },
});
const idString = (node: Obj, key: 'slug' | 'slugQualified'): string | undefined =>
	isPlainObject(node.identity) && typeof node.identity[key] === 'string'
		? (node.identity[key] as string)
		: undefined;
/** Read a node's interval channel HANDLE (its raw `identity.slug`) — the on-bus id tail and overlay
 *  match key. Undefined for an undirected single channel or a column node. */
export const specSlug = (node: Obj): string | undefined => idString(node, 'slug');
/** Read a channel node's baked QUALIFIED sensor id (undefined if unbaked). */
export const specSlugQualified = (node: Obj): string | undefined => idString(node, 'slugQualified');

/** One measured column located in the tree: its `interval_item` coordinate (`combined` → featureId +
 *  propertyId, both instance slots absent; `part` → partId; `instances` → 1-based ordinal) PLUS the
 *  column node (carries the `intervals` list). The coordinate IS the shared `interval_item` pointer
 *  (property/condition/interval_item.yaml) — never re-spelled here. */
export type MeasurandColumn = IntervalItem & { node: Obj };

/** One sensor CHANNEL: a column's coordinate PLUS, for a channel carried by a measurable interval,
 *  its channel `interval` slug (the by-slug handle a register FK names — `out` / `out_daily` / …,
 *  auto-slugged from the interval's flow_direction/period) and that interval node. A column with no
 *  measurable interval yields one channel at the column node (interval undefined) — prior single-cell
 *  behaviour, as does the one undirected/lifetime measurable channel (a slugless interval). */
export type MeasurandCell = IntervalItem & {
	node: Obj; // the measurable interval node, or the column node when the column has none
};

// A row's band body — `{ interval: {...} }` nested (the authored shape) or the row itself flat.
const bandOf = (row: Obj): Obj => (isPlainObject(row.interval) ? (row.interval as Obj) : row);

/** Is this interval row a `measurable` band — an instrument-readable span, i.e. one sensor channel? */
export const isMeasurableInterval = (row: unknown): row is Obj =>
	isPlainObject(row) && bandOf(row).intervalKind === 'measurable';

/** A column's measurable interval rows — each is its own sensor channel. */
const measurableRows = (column: Obj): Obj[] =>
	(Array.isArray(column.intervals) ? (column.intervals as unknown[]) : []).filter(
		isMeasurableInterval,
	);

/** Walk a device tree and yield every measurand column with its coordinates — the flat view the
 *  patch's nested `{feature}.{combined|part.<id>|instances[n]}.{quantity_kind}` mirrors. */
export function measurandColumns(device: Obj): MeasurandColumn[] {
	const cols: MeasurandColumn[] = [];
	for (const [featureKey, node] of Object.entries(device)) {
		if (!isMeasurandFeature(node)) continue;
		const featureId = snakeKey(featureKey); // cols carry the snake wire spelling, like every coordinate
		const fs = node.featureSpec as Obj;
		const push = (src: Obj, coord: { partId?: string; ordinal?: number }): void => {
			for (const col of quantityCols(src))
				cols.push({
					featureId,
					propertyId: quantityCode(col),
					node: src[col] as Obj,
					...coord,
				});
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
		if (rows.length === 0) return [col]; // no measurable interval — one channel at the column node
		// The channel keeps the column's coordinate; only its `intervalId` handle (undefined for the one
		// undirected/lifetime channel) and its node differ — spread, don't re-spell.
		return rows.map((row): MeasurandCell => ({ ...col, intervalId: specSlug(row), node: row }));
	});
}

/** The canonical join key for a measurand coordinate — a stable delimiter-joined string (empty
 *  segments kept, so channels never collide). The coordinate IS the shared `interval_item` pointer: a
 *  spec cell and a decode LINK (a modbus register / hid field / vedirect field, via its `intervalItem`)
 *  are two projections of the SAME pointer, so both sides build the key through HERE, neither
 *  hand-spells it. */
export const measurandKey = (c: IntervalItem): string =>
	[c.featureId, c.partId ?? c.ordinal?.toString(), c.propertyId, c.intervalId]
		.map((s) => s ?? '')
		.join('|');

/** The key a gateway publishes a measurand channel under in its grouped `state` JSON — the `/`-joined
 *  coordinate `<feature>/<part|ordinal>/<quantity_kind>/<interval?>`, canonical feature (pre-alias,
 *  matching what the wire actually carries). The counterpart of the gateway's register→sub-topic
 *  derivation, so a downstream bus reader derives the key HERE, never hand-spells it. */
export const measurandSubTopic = (
	cell: Pick<IntervalItem, 'featureId' | 'partId' | 'ordinal' | 'propertyId' | 'intervalId'>,
): string =>
	[cell.featureId, cell.partId ?? cell.ordinal?.toString(), cell.propertyId, cell.intervalId]
		.filter(Boolean)
		.join('/');
