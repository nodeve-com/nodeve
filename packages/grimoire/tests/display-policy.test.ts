// The display policy ships a schema + parser AND a committed instance (display-policy/sensors.yaml)
// — so this validates the schema against inline fixtures (positive + negative, incl. the plan's
// cross-field rules) and confirms the committed instance parses. The realization (copy/template
// fan-in, α computation) is downstream codegen, tested where it lives.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { displayPolicyFor, parseDisplayPolicy } from '../src/display-policy.ts';

const voltage = {
  feature: 'ac_phase',
  quantity_kind: 'voltage',
  filter_copy: [{ exponential_moving_average: '1.5s' }, { delta: '0.5%' }],
};
const counter = { raw_name: 'energy_import', filters: [{ delta: 0.005 }] };

describe('display policy', () => {
  it('accepts a well-formed policy and camelCases the TS surface', () => {
    const policy = parseDisplayPolicy([voltage, counter]);
    expect(policy[0]?.quantityKind).toBe('voltage');
    expect(policy[0]?.filterCopy?.[0]?.exponentialMovingAverage).toBe('1.5s');
    expect(policy[1]?.rawName).toBe('energy_import');
  });

  it('joins an entry onto a decoded register by (feature, quantity_kind) or raw_name', () => {
    const policy = parseDisplayPolicy([voltage, counter]);
    expect(displayPolicyFor(policy, { feature: 'ac_phase', quantityKind: 'voltage' })).toBe(policy[0]!);
    expect(displayPolicyFor(policy, { rawName: 'energy_import' })).toBe(policy[1]!);
    expect(displayPolicyFor(policy, { feature: 'grid', quantityKind: 'voltage' })).toBeUndefined();
    expect(displayPolicyFor(policy, { rawName: 'fast_0x153c' })).toBeUndefined();
  });

  it('rejects malformed entries: multi-key filters, non-time constants, unknown fields', () => {
    expect(() => parseDisplayPolicy([{ ...voltage, filter_copy: [{ delta: '0.5%', throttle: '1s' }] }])).toThrow();
    expect(() => parseDisplayPolicy([{ ...voltage, filter_copy: [{ exponential_moving_average: '0.125' }] }])).toThrow();
    expect(() => parseDisplayPolicy([{ ...voltage, extra: 1 }])).toThrow();
    expect(() => parseDisplayPolicy([])).toThrow();
  });

  it('enforces the cross-field rules: feature+quantity_kind XOR raw_name, unique keys, no throttle on a fan-in with a fast path', () => {
    expect(() => parseDisplayPolicy([{ feature: 'ac_phase', filters: [{ throttle: '1s' }] }])).toThrow('XOR');
    expect(() => parseDisplayPolicy([{ ...voltage, raw_name: 'both' }])).toThrow('XOR');
    expect(() => parseDisplayPolicy([voltage, voltage])).toThrow('duplicate');
    expect(() => parseDisplayPolicy([{ ...voltage, filters: [{ throttle: '1s' }] }])).toThrow('throttle');
    // A throttle on a calm-only entry (no delta copy) is fine.
    expect(() => parseDisplayPolicy([{ ...voltage, filter_copy: undefined, filters: [{ throttle: '1s' }] }])).not.toThrow();
  });

  it('the committed sensors.yaml is a valid instance', () => {
    const committed = parseYaml(readFileSync(join(import.meta.dirname, '..', 'display-policy', 'sensors.yaml'), 'utf8'));
    expect(() => parseDisplayPolicy(committed)).not.toThrow();
  });
});
