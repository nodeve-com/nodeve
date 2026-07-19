// Deterministic sensor ID builder — THE one formula every generator (esphome, gateway topics,
// ha-config entities) projects names from. Spec + worked examples: PLANS/deterministic-sensor-ids.md.
//
//   id = join([instance, feature, variant, part_id | ordinal, quantity_kind, interval].filter(Boolean), '_')
//
// Raw/unlinked registers (raw_name, no measurand link) short-circuit to instance + raw_name. The
// `feature` segment is the feature's on-bus handle — its authored `identity.slug` (a catalog fact:
// `ac_phase_three_point → ac`), resolved by the caller (generate-site) before it reaches here.
// Segments arrive as finished slugs; this builder never re-slugifies, it only joins and refuses
// non-slug input.

import { Value } from '@sinclair/typebox/value';
import { schema as slugSchema, type Slug } from './generated/property/slug.ts';
import { schema as ordinalSchema } from './generated/property/ordinal.ts';
import type { MeasurandLink } from './generated/features/measurand_link.ts';

/** The id-segment projection of one register/value: the `measurand_link` coordinate fields
 *  (`partId`/`ordinal`/`rawName`) it shares, plus the sensor-id's own RESOLVED handles — `feature` /
 *  `interval` are the on-bus `identity.slug` handles (`ac_phase_three_point → ac`), NOT the
 *  `featureId`/`intervalId` (the caller resolves them before this). `quantityKind` arrives as its
 *  resolved wire code (a slug segment). Segments are finished slugs; this builder only joins them. */
export type SensorIdParts = Pick<MeasurandLink, 'partId' | 'ordinal' | 'rawName'> & {
	instance: Slug; // effective identity.slug (site override or filename default)
	feature?: Slug; // the feature's on-bus handle (identity.slug), resolved from featureId upstream
	variant?: Slug;
	quantityKind?: string; // the measurand_link quantity_kind, as its resolved wire code
	interval?: Slug; // interval identity.slug — the measurable channel handle (energy: out / out_daily …)
	// or a rating band's derived in-band boolean; the sensor-id tail
};

/** Assert a segment is a `slug` — the `property/identity/slug` schema owns the pattern; this builder
 *  never re-spells it. */
function assertSlug(segment: string): string {
	if (!Value.Check(slugSchema, segment))
		throw new Error(`sensorId: segment ${JSON.stringify(segment)} is not a slug`);
	return segment;
}

/** The `part | ordinal` instance segment: a slug `partId` (wins), else an `ordinal` rendered decimal —
 *  a bare number, NOT a slug, so it's checked against the `ordinal` integer schema, not the slug one. */
function instanceSegment(partId?: Slug, ordinal?: number): string | undefined {
	if (partId !== undefined) return assertSlug(partId);
	if (ordinal === undefined) return undefined;
	if (!Value.Check(ordinalSchema, ordinal))
		throw new Error(`sensorId: ordinal ${JSON.stringify(ordinal)} is not a positive integer`);
	return String(ordinal);
}

// The id segments PAST the instance — the scoped part every generator shares. `instance` is the
// site-local device prefix; prepending it yields the globally-unique qualified id. Each slug segment
// is validated against the slug schema; the instance segment self-validates (slug or ordinal).
function scopedSegments(p: SensorIdParts): string[] {
	if (p.rawName !== undefined) return [assertSlug(p.rawName)];
	const slug = (s?: string): string[] => (s === undefined ? [] : [assertSlug(s)]);
	const inst = instanceSegment(p.partId, p.ordinal);
	return [
		...slug(p.feature),
		...slug(p.variant),
		...(inst === undefined ? [] : [inst]),
		...slug(p.quantityKind),
		...slug(p.interval),
	];
}

/** The SCOPED id — everything past the instance (feature ⊕ variant ⊕ part|ordinal ⊕ quantity_kind ⊕
 *  interval, or `rawName`). Device-local; what a producer already namespaced under its topic emits. */
export function scopedSensorId(parts: SensorIdParts): string {
	return scopedSegments(parts).join('_');
}

/** The QUALIFIED, globally-unique id — the instance prefix ⊕ the scoped id. What HA (which has no
 *  per-device namespace) uses as the entity id. */
export function sensorId(parts: SensorIdParts): string {
	return [assertSlug(parts.instance), ...scopedSegments(parts)].join('_');
}

/** The id of a quantity's derived in-band BOOLEAN — a baked sensor id (scoped or qualified) ⊕ the
 *  interval's `identity.slug`. For a consumer that holds the stamped `slug`/`slugQualified` and an
 *  interval off the merged device tree, so it never re-spells the join. */
export function intervalSensorId(sensorSlug: string, intervalSlug: string): string {
	return [assertSlug(sensorSlug), assertSlug(intervalSlug)].join('_');
}
