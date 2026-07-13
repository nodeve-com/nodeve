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
			{ data: { latitude: 37.8, longitude: -25.5, altitude: 250 }, valid: true, why: 'with altitude' },
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
			{ data: { target_temp_band: band, operating_temp_band: band, ground_temp_band: band }, valid: true, why: 'all three bands' },
			{ data: { target_temp_band: band, operating_temp_band: band }, valid: false, why: 'ground_temp_band missing' },
			{ data: { target_temp_band: { min: 10 }, operating_temp_band: band, ground_temp_band: band }, valid: false, why: 'band missing max' },
			{ data: { target_temp_band: band, operating_temp_band: band, ground_temp_band: band, extra: 1 }, valid: false, why: 'unknown key' },
		]);
	});
});

describe('solar_array', () => {
	const string = { ordinal: 1, active: true, catalog_item: { archetype_id: 'pv_module', slug: 'tsm_625neg19rc_20' }, series_count: 10, azimuth: 78, tilt: 38 };
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
				endpoint: { host: 'mqtt.familiar.media', version: '5.0', mqtt: { port: 1883 }, ws: { port: 1884 } },
			}),
		).toBe(true);
		// Legacy flat shape (pre-migration sites/*/mqtt.yaml): fields outside their feature.
		expect(check({ username: 'twig', host: 'mqtt.familiar.media', endpoint: { mqtt: { port: 1883 } } })).toBe(false);
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
