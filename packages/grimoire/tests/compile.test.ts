// Conformance for the YAML→schema compiler (kit/compile.ts): the fixtures that licensed deleting
// the transitional TypeBox mirrors, now pinned against the compiled schemas directly — every
// fixture keeps the accept/reject verdict the mirror-parity run established. mqtt_connection is
// the NEW nested contract (fields live inside features: `authentication:` nests, host/version/
// timeouts under `endpoint:` — sites/*/mqtt.yaml migrate with the consumer swap).

import { describe, expect, test } from 'vitest';
import { compileConcept } from '../kit/compile.ts';
import { ajv } from '../src/ajv.ts';

const compiled = (name: string) => ajv.compile(compileConcept(name));

function verdicts(name: string, fixtures: Array<{ data: unknown; valid: boolean; why: string }>) {
	const check = compiled(name);
	for (const f of fixtures) {
		expect(`${f.why}: compiled=${check(f.data)}`).toBe(`${f.why}: compiled=${f.valid}`);
	}
}

describe('location', () => {
	test('accepts/rejects per the pinned fixtures', () => {
		verdicts('location', [
			{ data: { latitude: 37.8, longitude: -25.5 }, valid: true, why: 'lat/long only' },
			{
				data: { latitude: 37.8, longitude: -25.5, altitude: 250 },
				valid: true,
				why: 'with altitude',
			},
			{ data: { latitude: 37.8 }, valid: false, why: 'longitude missing' },
			{ data: { latitude: 137.8, longitude: -25.5 }, valid: false, why: 'latitude out of range' },
			{ data: { latitude: 37.8, longitude: -25.5, name: 'x' }, valid: false, why: 'unknown key' },
		]);
	});
});

describe('ambient_tank', () => {
	const band = { min: 10, max: 25 };
	test('accepts/rejects per the pinned fixtures', () => {
		verdicts('ambient_tank', [
			{
				data: { target_temp_band: band, operating_temp_band: band, ground_temp_band: band },
				valid: true,
				why: 'all three bands',
			},
			{
				data: { target_temp_band: band, operating_temp_band: band },
				valid: false,
				why: 'ground_temp_band missing',
			},
			{
				data: { target_temp_band: { min: 10 }, operating_temp_band: band, ground_temp_band: band },
				valid: false,
				why: 'band missing max',
			},
			{
				data: {
					target_temp_band: band,
					operating_temp_band: band,
					ground_temp_band: band,
					extra: 1,
				},
				valid: false,
				why: 'unknown key',
			},
		]);
	});
});

describe('solar_array', () => {
	const string = {
		ordinal: 1,
		active: true,
		catalog_item: { archetype_id: 'pv_module', slug: 'tsm_625neg19rc_20' },
		series_count: 10,
		azimuth: 78,
		tilt: 38,
	};
	test('accepts/rejects per the pinned fixtures', () => {
		verdicts('solar_array', [
			{ data: { pv_strings: [string] }, valid: true, why: 'minimal array' },
			{ data: { pv_strings: [{ ...string, voc_eff: 469 }] }, valid: true, why: 'fitted voc_eff' },
			{
				data: { location: { latitude: 1, longitude: 2 }, pv_strings: [string] },
				valid: true,
				why: 'own location',
			},
			{ data: { pv_strings: [] }, valid: false, why: 'empty pv_strings' },
			{ data: {}, valid: false, why: 'pv_strings missing' },
			{
				data: { pv_strings: [{ ...string, series_count: 0 }] },
				valid: false,
				why: 'series_count not positive',
			},
		]);
	});
});

describe('mqtt_connection (new nested contract)', () => {
	test('accepts the feature-nested shape and rejects the legacy flat one', () => {
		const check = compiled('mqtt_connection');
		expect(
			check({
				authentication: { username: 'twig' },
				endpoint: {
					host: 'mqtt.familiar.media',
					version: '5.0',
					mqtt: { port: 1883 },
					ws: { port: 1884 },
				},
			}),
		).toBe(true);
		// Legacy flat shape (pre-migration sites/*/mqtt.yaml): fields outside their feature.
		expect(
			check({ username: 'twig', host: 'mqtt.familiar.media', endpoint: { mqtt: { port: 1883 } } }),
		).toBe(false);
		// endpoint is required; http is a message protocol but not a broker listener (parts filter).
		expect(check({})).toBe(false);
		expect(check({ endpoint: { host: 'x', http: { port: 80 } } })).toBe(false);
		expect(check({ endpoint: { host: 'x', version: '4.0' } })).toBe(false);
	});

	test('carries env-var annotations and scheme port defaults', () => {
		type Node = { properties: Record<string, Node>; [k: string]: unknown };
		const schema = compileConcept('mqtt_connection') as unknown as Node;
		const ep = schema.properties.endpoint!.properties;
		expect(ep.host['x-env-var']).toBe('MQTT_BROKER');
		expect(ep.mqtt.properties.port.default).toBe(1883);
		expect(ep.mqtts.properties.port.default).toBe(8883);
		expect(ep.ws.properties.port.default).toBe(1884);
		expect(ep.wss.properties.port['x-env-var']).toBe('MQTT_WSS_PORT');
	});
});

describe('desugarIntervalSlugs (kit/interval-slugs.ts)', async () => {
	const { desugarIntervalSlugs } = await import('../kit/interval-slugs.ts');

	test('auto-slug composes tier / zone (+ severity sub-grade); nominal fallback; authored slug untouched; measurable unslugged', () => {
		const entry = {
			f: {
				feature_spec: {
					combined: {
						voltage: {
							intervals: [
								{ interval: { rating: 'continuous', value: 230, severity: 'nominal' } }, // tier → continuous; nominal severity keys no token
								{ identity: { slug: 'peak' }, interval: { rating: 'short_term', max: 250 } }, // authored kept
								{ interval: { zone: 'mpp', value: 40 } }, // zone operating point (exact value) → mpp
								{ interval: { zone: 'mppt', severity: 'best', min: 175, max: 850 } }, // zone + severity sub-grade → mppt_best
								{ interval: { zone: 'running', trigger_on: 'above', min: 90, max: 140 } }, // stateful zone (trigger_on), kind stays zone, slug from zone
								{ interval: { value: 12, severity: 'nominal' } }, // bare bounds-free value → nominal
								{
									identity: { slug: 'grid' },
									interval: {
										rating: 'continuous',
										value: 220,
										fraction_lower: 0.7,
										fraction_upper: 1.2,
									},
								}, // multiplier sugar → margin delta
								{ interval: { interval_kind: 'measurable', min: 0, max: 300 } }, // no axis → unslugged
								{ interval: { trigger_on: 'below', value: 20 } }, // zone-less stateful trigger, bare value → NOT the nominal fallback, no derived kind
							],
						},
					},
				},
			},
		};
		desugarIntervalSlugs(entry, 'fixture');
		const rows = entry.f.feature_spec.combined.voltage.intervals as Array<{
			identity?: { slug: string };
			interval: { interval_kind?: string };
		}>;
		expect(rows[0]!.identity).toEqual({ slug: 'continuous' });
		expect(rows[0]!.interval.interval_kind).toBe('rating'); // derived from the tier
		expect(rows[1]!.identity).toEqual({ slug: 'peak' });
		expect(rows[2]!.identity).toEqual({ slug: 'mpp' });
		expect(rows[2]!.interval.interval_kind).toBe('zone'); // zone wins over the nominal fallback
		expect(rows[3]!.identity).toEqual({ slug: 'mppt_best' }); // severity is identity-bearing
		expect(rows[3]!.interval.interval_kind).toBe('zone');
		expect(rows[4]!.identity).toEqual({ slug: 'running' }); // stateful zone: slug from zone name
		expect(rows[4]!.interval.interval_kind).toBe('zone'); // derived from zone; trigger_on is a statefulness axis, not a kind
		expect(rows[5]!.identity).toEqual({ slug: 'nominal' }); // bounds-free nominal fallback
		expect(rows[5]!.interval.interval_kind).toBe('rating');
		const grid = rows[6]!.interval as {
			fraction_lower?: number;
			margin_lower?: number;
			margin_upper?: number;
		};
		expect(grid.margin_lower).toBe(0.3); // fraction_lower 0.7 -> margin_lower delta 0.3
		expect(grid.margin_upper).toBeCloseTo(0.2); // fraction_upper 1.2 -> margin_upper delta 0.2
		expect(grid.fraction_lower).toBeUndefined(); // sugar consumed
		expect(rows[7]!.identity).toBeUndefined();
		expect(rows[8]!.interval.interval_kind).toBeUndefined(); // no zone/rating → no derived kind; trigger_on alone doesn't derive one
		expect(rows[8]!.identity).toBeUndefined(); // bare value + trigger_on must NOT hit the nominal fallback
	});

	test('duplicate slugs within one intervals list throw; the same slug on sibling lists is fine', () => {
		const dup = {
			intervals: [{ interval: { rating: 'continuous' } }, { interval: { rating: 'continuous' } }],
		};
		expect(() => desugarIntervalSlugs(dup, 'fixture')).toThrow(/duplicated/);
		const siblings = {
			voltage: { intervals: [{ interval: { rating: 'continuous' } }] },
			current: { intervals: [{ interval: { rating: 'continuous' } }] },
		};
		expect(() => desugarIntervalSlugs(siblings, 'fixture')).not.toThrow();
	});
});

describe('validateConditionRefs (kit/validate-conditions.ts)', async () => {
	const { validateConditionRefs } = await import('../kit/validate-conditions.ts');
	const entry = () => ({
		settings_schema: { type: 'object', properties: { grid_region: { enum: ['eu_230v_50hz'] } } },
		enclosure: {
			feature_spec: {
				combined: {
					temperature: {
						intervals: [{ identity: { slug: 'derate_zone' }, interval: { rating: 'operating' } }],
					},
				},
			},
		},
		grid: {
			feature_spec: {
				combined: {
					active_power: {
						intervals: [
							{
								identity: { slug: 'operating' },
								interval: { rating: 'operating', max: 10000 },
								condition: [
									{
										interval_item: {
											feature: 'enclosure',
											property: 'temperature',
											interval: 'derate_zone',
										},
									},
									{ setting: 'grid_region', equals: 'eu_230v_50hz' },
								],
							},
						],
					},
				},
			},
		},
	});

	test('resolving pointers pass', () => {
		expect(() => validateConditionRefs(entry(), 'fixture')).not.toThrow();
	});

	test('dangling feature / property / interval slug throw', () => {
		const missingFeature = entry();
		missingFeature.grid.feature_spec.combined.active_power.intervals[0]!.condition[0]!.interval_item!.feature =
			'nope';
		expect(() => validateConditionRefs(missingFeature, 'fixture')).toThrow(/no such spec feature/);
		const missingProperty = entry();
		missingProperty.grid.feature_spec.combined.active_power.intervals[0]!.condition[0]!.interval_item!.property =
			'nope';
		expect(() => validateConditionRefs(missingProperty, 'fixture')).toThrow(/no such property/);
		const missingInterval = entry();
		missingInterval.grid.feature_spec.combined.active_power.intervals[0]!.condition[0]!.interval_item!.interval =
			'nope';
		expect(() => validateConditionRefs(missingInterval, 'fixture')).toThrow(/no interval answers/);
	});

	test('setting gates validate against settings_schema', () => {
		const badKey = entry();
		badKey.grid.feature_spec.combined.active_power.intervals[0]!.condition[1]!.setting = 'nope';
		expect(() => validateConditionRefs(badKey, 'fixture')).toThrow(/not a key/);
		const badValue = entry();
		badValue.grid.feature_spec.combined.active_power.intervals[0]!.condition[1]!.equals =
			'br_220v_60hz';
		expect(() => validateConditionRefs(badValue, 'fixture')).toThrow(/never equals/);
	});
});
