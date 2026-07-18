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

	test('auto-slug composes tier / nominal + mode + condition; authored slug untouched; measurable unslugged', () => {
		const entry = {
			f: {
				feature_spec: {
					combined: {
						voltage: {
							intervals: [
								{ interval: { rating: 'continuous', nominal: 230 } }, // tier → continuous
								{ identity: { slug: 'peak' }, interval: { rating: 'short_term', max: 250 } }, // authored kept
								{ interval: { mode: 'mpp', nominal: 40 } }, // bounds-free nominal + mode → nominal_mpp
								{ interval: { interval_kind: 'measurable', min: 0, max: 300 } }, // no axis → unslugged
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
		expect(rows[2]!.identity).toEqual({ slug: 'nominal_mpp' });
		expect(rows[2]!.interval.interval_kind).toBe('rating'); // derived from bounds-free nominal
		expect(rows[3]!.identity).toBeUndefined();
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
