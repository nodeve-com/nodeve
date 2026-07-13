// The deterministic-ID goal (PLANS/deterministic-sensor-ids.md) exercised against the real
// dtsu666 catalog entry. The feature's on-bus handle is its authored `identity.slug`
// (`ac_phase_three_point → ac`), a CATALOG fact (site-agnostic); the only site overlay is the
// instance slug, an inline fixture mirroring sites/lounge/catalog/grid_meter_live.yaml.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { sensorId } from '../src/sensor-id.ts';
import { measurandSubTopic } from '../src/measurand-tree.ts';

const instance = 'grid_meter_live'; // site file stem overrides catalog slug chint_dtsu666_4wire

interface Register {
  feature_id?: string;
  part_id?: string;
  quantity_kind?: string;
  raw_name?: string;
}

const device = parseYaml(
  readFileSync(join(import.meta.dirname, '../concepts/catalog/chint/dtsu666.yaml'), 'utf8'),
) as { modbus: { modbus_registers: Register[] }; [feature: string]: unknown };

// The feature → on-bus slug map the site bake reads off each feature's `identity.slug` (here from
// the source YAML; generate-site reads the baked device). Unauthored ⇒ the feature slug itself.
const featureSlug = (feature: string): string => {
  const node = device[feature];
  const id = node && typeof node === 'object' ? (node as { identity?: { slug?: unknown } }).identity : undefined;
  return typeof id?.slug === 'string' ? id.slug : feature;
};

const ids = device.modbus.modbus_registers.map((r) =>
  sensorId({
    instance,
    feature: r.feature_id ? featureSlug(r.feature_id) : undefined,
    partId: r.part_id,
    quantityKind: r.quantity_kind,
    rawName: r.raw_name,
  }),
);

describe('sensorId over the dtsu666 register map', () => {
  test('renders the aliased worked examples', () => {
    expect(ids).toContain('grid_meter_live_ac_a_voltage');
    expect(ids).toContain('grid_meter_live_ac_ab_voltage');
    expect(ids).toContain('grid_meter_live_ac_frequency'); // combined — no part segment
    expect(ids).toContain('grid_meter_live_ac_active_power');
  });

  test('never leaks the canonical feature slug once the identity.slug handle is applied', () => {
    expect(ids.some((id) => id.includes('ac_phase_three_point'))).toBe(false);
  });

  test('per-phase displacement angle renders as a linked measurand id', () => {
    expect(ids).toContain('grid_meter_live_ac_a_phase_angle');
  });

  test('both banks land on one measurand id (decoder reconciles, no duplication)', () => {
    expect(ids.filter((id) => id === 'grid_meter_live_ac_a_voltage')).toHaveLength(2); // bank A + B
  });

  test('a feature with no identity.slug renders its own slug verbatim', () => {
    expect(sensorId({ instance, feature: 'ac_phase_three_point', partId: 'a', quantityKind: 'voltage' })).toBe(
      'grid_meter_live_ac_phase_three_point_a_voltage',
    );
  });

  test('rejects a non-slug segment', () => {
    expect(() => sensorId({ instance: 'Grid Meter' })).toThrow(/not a slug/);
  });
});

// The grouped-state wire key a MASTER-mode gateway publishes by — the `/`-joined
// coordinate, the TS mirror of the gateway's `topic_for_register`. (The ESPHome tap instead emits the
// flat scoped slug; scry reads that via SiteSensor.slug, not this.)
describe('measurandSubTopic', () => {
  test('joins feature / part / quantity_kind', () => {
    expect(measurandSubTopic({ feature: 'ac', partId: 'a', quantityKind: 'active_power' })).toBe('ac/a/active_power');
  });

  test('combined column drops the part segment', () => {
    expect(measurandSubTopic({ feature: 'ac', quantityKind: 'active_power' })).toBe('ac/active_power');
  });

  test('an ordinal instance renders its 1-based position', () => {
    expect(measurandSubTopic({ feature: 'ac_phase', ordinal: 2, quantityKind: 'voltage' })).toBe('ac_phase/2/voltage');
  });
});
