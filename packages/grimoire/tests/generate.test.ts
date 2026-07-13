// The YAML-era codegen: committed mirrors must match a fresh render (a --no-verify commit or a
// hookless clone can't let them drift), and the cascade→envelope catalog walk must keep working
// even while its emit is off (generate.ts EMIT_CATALOG).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { outputs } from '../kit/generate.ts';
import { ACCUMULATION, QUANTITY_KIND } from '../src/vocab.ts';

describe('grimoire-generate mirrors', () => {
	it('every emitted file matches its committed contents', () => {
		for (const [path, contents] of Object.entries(outputs())) {
			expect(readFileSync(path, 'utf8'), path).toBe(contents);
		}
	});
});

describe('baked vocab dicts', () => {
	it('ACCUMULATION crosswalks to HA state_class', () => {
		expect(ACCUMULATION.crosswalk('instantaneous', 'ha_state_class')).toBe('measurement');
		expect(ACCUMULATION.crosswalk('cumulative_monotonic', 'ha_state_class')).toBe('total_increasing');
		expect(ACCUMULATION.crosswalk('cumulative', 'prometheus')).toBeUndefined();
	});

	it('quantity kinds crosswalk to HA device_class', () => {
		expect(QUANTITY_KIND.crosswalk('active_power', 'ha_device_class')).toBe('power');
		expect(QUANTITY_KIND.crosswalk('voltage', 'ha_device_class')).toBe('voltage');
	});
});
