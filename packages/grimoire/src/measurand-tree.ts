// The shape of a device's SPECIFICATION measurand tree — the structural grammar shared by the two
// sides of the sensor-id contract: `generate-site.ts` (WRITES a sparse slug patch mirroring the
// tree) and `site-view.ts` (READS the merged tree back into a flat sensor list). One definition of
// "what a measurand feature looks like" so the writer and reader can't drift.
//
// A feature node is a measurand feature when every key is either a STRUCTURAL slot (how the feature
// is instanced) or a quantity_kind column (a measured quantity). A column node carries the
// measurand metadata (intervals / si_unit …) and, once the patch is merged on, its `slug`.

import quantityKinds from './generated/enumeration/quantity_kind.ts';

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const QUANTITY_KIND = new Set(Object.keys(quantityKinds));

/** Is this feature node a measurand feature — does it carry a `feature_spec` spec body (the
 *  {combined, part, instances} breakdown of its quantity columns)? */
export const isMeasurandFeature = (node: unknown): node is Obj => isObj(node) && isObj(node.feature_spec);

/** The quantity_kind keys directly on a node (its measured-quantity columns). */
export const quantityCols = (node: Obj): string[] => Object.keys(node).filter((k) => QUANTITY_KIND.has(k));

// Where a column's deterministic on-bus id lives inside its `specification` value: the
// `identity.slug` handle (archetypes/specification composes the `identity` feature). The writer
// (generate-site bakes the patch) and the reader (site-view reads it back) BOTH go through these,
// so the location is defined ONCE here — change the specification archetype's id slot, change it here.
/** Build the sparse patch that plants a column's baked slugs at its specification's id handle: the
 *  SCOPED `slug` (device-local, for a producer that already namespaces) + the QUALIFIED
 *  `slug_qualified` (instance-prefixed, globally unique — HA's entity id). */
export const specSlugPatch = (slug: string, slugQualified: string): Obj => ({ identity: { slug, slug_qualified: slugQualified } });
const idString = (node: Obj, key: 'slug' | 'slug_qualified'): string | undefined =>
	isObj(node.identity) && typeof node.identity[key] === 'string' ? (node.identity[key] as string) : undefined;
/** Read a column node's baked SCOPED slug back from its specification's id handle (undefined if unbaked). */
export const specSlug = (node: Obj): string | undefined => idString(node, 'slug');
/** Read a column node's baked QUALIFIED slug back from its specification's id handle (undefined if unbaked). */
export const specSlugQualified = (node: Obj): string | undefined => idString(node, 'slug_qualified');

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
	for (const [feature, node] of Object.entries(device)) {
		if (!isMeasurandFeature(node)) continue;
		const fs = node.feature_spec as Obj;
		const push = (src: Obj, coord: { partId?: string; ordinal?: number }): void => {
			for (const quantityKind of quantityCols(src)) cells.push({ feature, quantityKind, node: src[quantityKind] as Obj, ...coord });
		};
		if (isObj(fs.combined)) push(fs.combined, {}); // the whole / aggregate (incl. a single spec feature's columns)
		if (isObj(fs.part)) for (const [partId, p] of Object.entries(fs.part as Obj)) push(p as Obj, { partId });
		if (Array.isArray(fs.instances)) (fs.instances as Obj[]).forEach((inst, i) => push(inst, { ordinal: i + 1 }));
	}
	return cells;
}

/** The key a gateway publishes a measurand column under in its grouped `state` JSON — the `/`-joined
 *  measurand coordinate `<feature>/<part|ordinal>/<quantity_kind>`, canonical feature (pre-alias,
 *  matching what the wire actually carries). The counterpart of the gateway's register→sub-topic
 *  derivation, so a downstream bus reader derives the key HERE, never hand-spells it. */
export const measurandSubTopic = (cell: Pick<MeasurandCell, 'feature' | 'partId' | 'ordinal' | 'quantityKind'>): string =>
	[cell.feature, cell.partId ?? cell.ordinal?.toString(), cell.quantityKind].filter(Boolean).join('/');
