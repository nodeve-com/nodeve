// The shape of a device's SPECIFICATION measurand tree — the structural grammar shared by the two
// sides of the sensor-id contract: `generate-site.ts` (WRITES a sparse slug patch mirroring the
// tree) and `site-view.ts` (READS the merged tree back into a flat sensor list). One definition of
// "what a measurand feature looks like" so the writer and reader can't drift.
//
// A feature node is a measurand feature when every key is either a STRUCTURAL slot (how the feature
// is instanced) or a quantity_kind column (a measured quantity). A column node carries the
// measurand metadata (intervals / si_unit …) and, once the patch is merged on, its `slug`.

import quantityKinds from './generated/enumeration/quantity_kind.ts';
import quantities from './generated/enumeration/quantity.ts';
import { isPlainObject } from 'remeda';

export type Obj = Record<string, unknown>;

// The trees here are the CAMEL generated device grain (loadDevice / the emitted TS catalog), so
// column keys are the camelCase dict keys; each member's authoritative snake `code` is the on-bus
// spelling ids/coordinates carry. One map holds both: camel key → wire code.
const QUANTITY_KIND_CODE = new Map<string, string>(
	Object.entries(quantityKinds).map(([k, t]) => [k, t.code]),
);
// A column may ALSO be keyed by a valued `quantity` (enumeration/quantity) — a NAMED measurand over a
// base kind (feed_in_energy → active_energy). Merged into column detection so such a column emits its
// OWN slug as the id/topic segment; its base kind (for unit/device_class) is `baseQuantityKind`.
const QUANTITY_CODE = new Map<string, string>([
	...QUANTITY_KIND_CODE,
	...Object.entries(quantities).map(([k, t]) => [k, t.code] as const),
]);
// wire code → base quantity_kind code (a bare kind maps to itself).
const BASE_KIND = new Map<string, string>(
	Object.values(quantities).map((t) => [t.code, t.measures.quantityKind]),
);

/** The base quantity_kind a column code measures — a valued `quantity` resolves to its referenced
 *  kind (feed_in_energy → active_energy); a bare quantity_kind returns itself. Downstream unit /
 *  device_class crosswalks go through this. */
export const baseQuantityKind = (code: string): string => BASE_KIND.get(code) ?? code;

/** Is this feature node a measurand feature — does it carry a `featureSpec` spec body (the
 *  {combined, part, instances} breakdown of its quantity columns)? */
export const isMeasurandFeature = (node: unknown): node is Obj =>
	isPlainObject(node) && isPlainObject(node.featureSpec);

/** The quantity-kind keys directly on a node (its measured-quantity columns) — the CAMEL tree keys. */
export const quantityCols = (node: Obj): string[] =>
	Object.keys(node).filter((k) => QUANTITY_CODE.has(k));

/** A column key's wire `code` — the snake on-bus spelling every id/coordinate carries. */
export const quantityCode = (camelKey: string): string => QUANTITY_CODE.get(camelKey) ?? camelKey;

/** A camel tree key's snake wire spelling (feature keys camelize their authored slug). */
export const snakeKey = (camelKey: string): string =>
	camelKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// Where a column's deterministic on-bus id lives inside its `specification` value: the
// `identity.slug` handle (archetypes/specification composes the `identity` feature). The writer
// (generate-site bakes the patch) and the reader (site-view reads it back) BOTH go through these,
// so the location is defined ONCE here — change the specification archetype's id slot, change it here.
/** Build the sparse patch that plants a column's baked slugs at its specification's id handle: the
 *  SCOPED `slug` (device-local, for a producer that already namespaces) + the QUALIFIED
 *  `slug_qualified` (instance-prefixed, globally unique — HA's entity id). */
export const specSlugPatch = (slug: string, slugQualified: string): Obj => ({
	identity: { slug, slugQualified },
});
const idString = (node: Obj, key: 'slug' | 'slugQualified'): string | undefined =>
	isPlainObject(node.identity) && typeof node.identity[key] === 'string'
		? (node.identity[key] as string)
		: undefined;
/** Read a column node's baked SCOPED slug back from its specification's id handle (undefined if unbaked). */
export const specSlug = (node: Obj): string | undefined => idString(node, 'slug');
/** Read a column node's baked QUALIFIED slug back from its specification's id handle (undefined if unbaked). */
export const specSlugQualified = (node: Obj): string | undefined => idString(node, 'slugQualified');

/** One measured column located in the tree: its feature, its instance coordinate (`combined` → both
 *  absent; `part` → partId; `instances` → 1-based ordinal), its quantity_kind, and the column node. */
export interface MeasurandCell {
	feature: string;
	partId?: string;
	ordinal?: number;
	quantityKind: string;
	node: Obj;
}

/** Walk a device tree and yield every measurand column with its coordinates — the flat view the
 *  patch's nested `{feature}.{combined|part.<id>|instances[n]}.{quantity_kind}` mirrors. */
export function measurandCells(device: Obj): MeasurandCell[] {
	const cells: MeasurandCell[] = [];
	for (const [featureKey, node] of Object.entries(device)) {
		if (!isMeasurandFeature(node)) continue;
		const feature = snakeKey(featureKey); // cells carry the snake wire spelling, like every coordinate
		const fs = node.featureSpec as Obj;
		const push = (src: Obj, coord: { partId?: string; ordinal?: number }): void => {
			for (const col of quantityCols(src))
				cells.push({ feature, quantityKind: quantityCode(col), node: src[col] as Obj, ...coord });
		};
		if (isPlainObject(fs.combined)) push(fs.combined, {}); // the whole / aggregate (incl. a single spec feature's columns)
		if (isPlainObject(fs.part))
			for (const [partId, p] of Object.entries(fs.part as Obj)) push(p as Obj, { partId });
		if (Array.isArray(fs.instances))
			(fs.instances as Obj[]).forEach((inst, i) => push(inst, { ordinal: i + 1 }));
	}
	return cells;
}

/** The key a gateway publishes a measurand column under in its grouped `state` JSON — the `/`-joined
 *  measurand coordinate `<feature>/<part|ordinal>/<quantity_kind>`, canonical feature (pre-alias,
 *  matching what the wire actually carries). The counterpart of the gateway's register→sub-topic
 *  derivation, so a downstream bus reader derives the key HERE, never hand-spells it. */
export const measurandSubTopic = (
	cell: Pick<MeasurandCell, 'feature' | 'partId' | 'ordinal' | 'quantityKind'>,
): string =>
	[cell.feature, cell.partId ?? cell.ordinal?.toString(), cell.quantityKind]
		.filter(Boolean)
		.join('/');
