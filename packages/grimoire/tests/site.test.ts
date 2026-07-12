// The permanent site-concept surface (kit/site.ts): the generic parse over the BAKED schemas
// (generated/index.ts) + the topic/env derivations — behavior ported verbatim from
// the deleted transitional parsers, so the pinned strings here are the deployed contract.

import { describe, expect, test } from 'vitest';
import {
	MQTT_ENV,
	MQTT_ENV_NAMES,
	parseConcept,
	parseSiteAdapter,
	sensorStateTopic,
	tapWindowTopic,
} from '../kit/site.ts';
import { validateSite } from '../kit/validate-site.ts';

// One adapter instance — an ordinary `site_adapter` concept. The shared topic root lives on the
// connection (`mqtt_connection.emit.topic_prefix`), passed to the derivations below.
const ROOT = 'familiar/lounge';
const ADAPTER = {
	identity: { slug: 'grid_meter' },
	title: { en: 'Grid Live Meter' },
	ingest: { ingest_kind: 'modbus_tap' },
	modbus_tap_window: [{ name: 'telemetry', address: 5392 }],
};

describe('parseConcept', () => {
	test('validates against the baked schema and camelizes', () => {
		const loc = parseConcept('location', { latitude: 37.8, longitude: -25.5, altitude: 250 });
		expect(loc).toEqual({ latitude: 37.8, longitude: -25.5, altitude: 250 });
		expect(parseConcept('site_adapter', ADAPTER).identity?.slug).toBe('grid_meter');
	});
	test('throws an aggregated error on invalid data', () => {
		expect(() => parseConcept('location', { latitude: 137.8 })).toThrow(/Invalid location config:/);
	});
});

describe('parseSiteAdapter', () => {
	test('validates + camelizes a tap adapter with its window block', () => {
		expect(parseSiteAdapter(ADAPTER).ingest?.ingestKind).toBe('modbus_tap');
	});
});

describe('validateSite — site_adapter cross-field rule', () => {
	test('accepts a tap adapter carrying its window block', () => {
		expect(() => validateSite({ site_adapter: [ADAPTER] }, 'test')).not.toThrow();
	});
	test('rejects a tap window block on a non-tap (master) adapter', () => {
		const bad = { ...ADAPTER, ingest: { service_id: 'modbus_tcp' } };
		expect(() => validateSite({ site_adapter: [bad] }, 'test')).toThrow(/modbus_tap/);
	});
});

describe('topic derivations', () => {
	const adapter = parseSiteAdapter(ADAPTER);
	test('tapWindowTopic — <topic_prefix>/<slug>/<ingest_kind>/<window>', () => {
		expect(tapWindowTopic(ROOT, adapter, 'telemetry')).toBe('familiar/lounge/grid_meter/modbus_tap/telemetry');
		expect(() => tapWindowTopic(ROOT, adapter, 'nope')).toThrow(/no tap window/);
	});
	test('sensorStateTopic — <topic_prefix>/<slug>/sensor/<name>/state, flat slug only', () => {
		expect(sensorStateTopic(ROOT, adapter, 'grid_a_voltage')).toBe(
			'familiar/lounge/grid_meter/sensor/grid_a_voltage/state',
		);
		expect(() => sensorStateTopic(ROOT, adapter, 'a/b')).toThrow(/not a flat slug/);
	});
});

describe('MQTT_ENV (derived from the baked mqtt_connection schema)', () => {
	test('carries the canonical names', () => {
		expect(MQTT_ENV_NAMES).toContain('MQTT_BROKER');
		expect(MQTT_ENV_NAMES).toContain('MQTT_PASSWORD');
		expect(MQTT_ENV_NAMES).toContain('MQTT_WSS_PATHNAME');
		expect(MQTT_ENV.endpoint_host).toBe('MQTT_BROKER');
		expect(MQTT_ENV.authentication_password).toBe('MQTT_PASSWORD');
	});
});
