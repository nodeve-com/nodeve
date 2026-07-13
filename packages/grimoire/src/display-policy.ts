// DISPLAY POLICY schema — the authored, agnostic per-quantity filter/publish policy for the
// HA-facing per-sensor path (docs/esphome-ha-filters.md). The policy governs what a dashboard
// shows and how calmly — "voltage smooths on ~1.5s, publish on ≥0.5% change" — keyed by
// (feature, quantity_kind) for linked measurands or raw_name for still-unattributed registers.
// Instances live beside this file (display-policy/sensors.yaml); the downstream codegen joins them
// onto each decoded register and REALIZES them (copy/template fan-in, α computation) — nothing
// runtime-specific is authored here.
//
// The filter model (the load-bearing rules, settled in the plan):
//  - `filters` is the final sensor's own chain; `filter_copy` (optional) turns the sensor into a
//    fan-in — one copy per item, any copy's emit publishes into the final sensor. Fast path =
//    `delta`, calm path = `throttle_average` or EMA. The fast path is never rate-limited — its
//    whole job is immediacy — so its threshold must sit ABOVE the signal's idle noise; the calm
//    path owns the regular cadence.
//  - Frequency-robust filters (`throttle`, `throttle_average`, `delta`) are valid anywhere. A
//    sample-relative filter (`exponential_moving_average`) is opt-in and Δt-DEPENDENT: codegen
//    needs the tap window's `observed_interval_ms` to pin α = 1 − e^(−Δt/τ), else it falls back
//    to `throttle_average` over the same window.
//  - Smoothing constants are authored as TIME (τ / a window), never α or sample counts.
//  - With a fast-change (`delta`) copy present, the final chain must not `throttle` — a trip
//    landing inside a heartbeat-opened window would be silently dropped (enforced in the parser).

import { type Static, Type } from '@sinclair/typebox';
import type { Camelize } from 'remeda-humps';
import { validateAndCamelize } from './parse.ts';

// A smoothing/throttle constant, authored as time (e.g. '1.5s', '500ms').
const DurationSchema = Type.String({ pattern: '^\\d+(\\.\\d+)?(ms|s|min)$' });

// One filter — a single-key map, YAML-authored as `- throttle_average: 1.5s`. `delta` takes a
// relative '0.5%' or an absolute number in the sensor's own unit.
export const DisplayFilterSchema = Type.Object(
	{
		throttle: Type.Optional(DurationSchema),
		throttle_average: Type.Optional(DurationSchema),
		delta: Type.Optional(Type.Union([Type.Number({ exclusiveMinimum: 0 }), Type.String({ pattern: '^\\d+(\\.\\d+)?%$' })])),
		exponential_moving_average: Type.Optional(DurationSchema),
	},
	{ additionalProperties: false, minProperties: 1, maxProperties: 1 },
);

// One policy entry: the join key (feature+quantity_kind XOR raw_name — enforced in the parser),
// the filter model, and the HA entity passthroughs.
export const DisplayPolicyEntrySchema = Type.Object(
	{
		feature: Type.Optional(Type.String({ minLength: 1 })),
		quantity_kind: Type.Optional(Type.String({ minLength: 1 })),
		raw_name: Type.Optional(Type.String({ minLength: 1 })),
		filters: Type.Optional(Type.Array(DisplayFilterSchema, { minItems: 1 })),
		filter_copy: Type.Optional(Type.Array(DisplayFilterSchema, { minItems: 1 })),
		// Passthrough to the HA entity: registered but disabled until someone opts in.
		disabled_by_default: Type.Optional(Type.Boolean()),
		// Display precision on the HA-facing sensor — overrides the decoded register's own decimals
		// (the dashboard may want fewer digits than the raw decode carries).
		accuracy_decimals: Type.Optional(Type.Integer({ minimum: 0 })),
	},
	{ additionalProperties: false },
);

export const DisplayPolicySchema = Type.Array(DisplayPolicyEntrySchema, { minItems: 1 });

export type DisplayFilter = Camelize<Static<typeof DisplayFilterSchema>>;
export type DisplayPolicyEntry = Camelize<Static<typeof DisplayPolicyEntrySchema>>;
export type DisplayPolicy = Camelize<Static<typeof DisplayPolicySchema>>;

/** Validate against the (snake_case) schema, camelCase it, then enforce the cross-field rules the
 *  JSON Schema can't express: each entry is keyed by (feature + quantity_kind) XOR raw_name, keys
 *  are unique, and a fast-change (`delta`) copy forbids a `throttle` on the final chain (the
 *  silent-drop configuration the plan's caveat names). */
export const parseDisplayPolicy = (data: unknown): DisplayPolicy => {
	const policy = validateAndCamelize<DisplayPolicy>(DisplayPolicySchema, data, 'display policy');
	const keys = policy.map((entry) => {
		const linked = entry.feature !== undefined && entry.quantityKind !== undefined;
		const half = entry.feature !== undefined || entry.quantityKind !== undefined;
		if (linked === (entry.rawName !== undefined) || (!linked && half)) {
			throw new Error(`Invalid display policy: entry must be keyed by feature + quantity_kind XOR raw_name: ${JSON.stringify(entry)}`);
		}
		return linked ? `${entry.feature}/${entry.quantityKind}` : entry.rawName!;
	});
	const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
	if (dupes.length > 0) throw new Error(`Invalid display policy: duplicate key(s): ${[...new Set(dupes)].join(', ')}`);
	for (const [i, entry] of policy.entries()) {
		const fastCopy = entry.filterCopy?.some((f) => f.delta !== undefined);
		const throttled = entry.filters?.some((f) => f.throttle !== undefined);
		if (fastCopy && throttled) {
			throw new Error(`Invalid display policy: "${keys[i]}" has a delta filter_copy (fast path) AND a throttle on the final chain — the throttle silently drops trips landing inside a heartbeat window; drop it (the copies govern cadence).`);
		}
	}
	return policy;
};

/** The DECLARED HA entity id of an adapter's HA-facing point, stated ONCE: `sensor.<adapterSlug>_
 *  <point slug>` — machine id composed from machine ids, never from a display label. HA's own
 *  minting at creation is NOT deterministic (it folds in registry context like area/device names),
 *  so consumers declare ids through this and conform HA to them (ha-config's `reconcile`). */
export const haEntityId = (adapterSlug: string, pointSlug: string): string => `sensor.${adapterSlug}_${pointSlug}`;

/** An entry's join key against a decoded register: (feature, quantity_kind) for a linked
 *  measurand, raw_name otherwise. Returns the matching entry or undefined (no policy = no
 *  HA-facing publish for that point). */
export const displayPolicyFor = (
	policy: DisplayPolicy,
	register: { feature?: string; quantityKind?: string; rawName?: string },
): DisplayPolicyEntry | undefined =>
	policy.find((entry) =>
		register.feature && register.quantityKind
			? entry.feature === register.feature && entry.quantityKind === register.quantityKind
			: entry.rawName !== undefined && entry.rawName === register.rawName,
	);
