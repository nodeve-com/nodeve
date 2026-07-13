// Deterministic sensor ID builder — THE one formula every generator (esphome, gateway topics,
// ha-config entities) projects names from. Spec + worked examples: PLANS/deterministic-sensor-ids.md.
//
//   id = join([instance, feature, variant, part_id | ordinal, quantity_kind].filter(Boolean), '_')
//
// Raw/unlinked registers (raw_name, no measurand link) short-circuit to instance + raw_name. The
// `feature` segment is the feature's on-bus handle — its authored `identity.slug` (a catalog fact:
// `ac_phase_three_point → ac`), resolved by the caller (generate-site) before it reaches here.
// Segments arrive as finished slugs; this builder never re-slugifies, it only joins and refuses
// non-slug input.

const SLUG = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/** The measurand link of one register/value — the feature slug already resolved to its on-bus handle. */
export interface SensorIdParts {
  instance: string; // effective identity.slug (site override or filename default)
  feature?: string;
  variant?: string;
  partId?: string; // bare part-instance id (a | ab | …); wins over ordinal when both set
  ordinal?: number;
  quantityKind?: string;
  rawName?: string; // unlinked register — id is instance + rawName, nothing else
}

function assertSlug(segment: string): string {
  if (!SLUG.test(segment)) throw new Error(`sensorId: segment ${JSON.stringify(segment)} is not a slug`);
  return segment;
}

// The id segments PAST the instance — the scoped part every generator shares. `instance` is the
// site-local device prefix; prepending it yields the globally-unique qualified id.
function scopedSegments({ feature, variant, partId, ordinal, quantityKind, rawName }: SensorIdParts): string[] {
  const segments = rawName ? [rawName] : [feature, variant, partId ?? ordinal?.toString(), quantityKind];
  return segments.filter((s): s is string => Boolean(s)).map(assertSlug);
}

/** The SCOPED id — everything past the instance (feature ⊕ variant ⊕ part|ordinal ⊕ quantity_kind,
 *  or `rawName`). Device-local; what a producer already namespaced under its node/topic emits. */
export function scopedSensorId(parts: SensorIdParts): string {
  return scopedSegments(parts).join('_');
}

/** The QUALIFIED, globally-unique id — the instance prefix ⊕ the scoped id. What HA (which has no
 *  per-device namespace) uses as the entity id. */
export function sensorId(parts: SensorIdParts): string {
  return [assertSlug(parts.instance), ...scopedSegments(parts)].join('_');
}
