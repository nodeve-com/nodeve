// Energy channels via ONE interval FK (no named-quantity layer, no second flow/period FK): several
// sensor channels of ONE active_energy column, each a measurable interval auto-slugged from its
// flow_direction/period axes (out / out_daily / in / in_daily) → distinct sub-topic/slug. A register
// links a channel by the SAME interval_item triple: feature_id + quantity_kind + interval-slug.
// Exercised against the real ps10sh grid CT.
import { describe, expect, test } from 'vitest';
import { loadDevice } from '../src/catalog.ts';
import { measurandCells, measurandSubTopic } from '../src/measurand-tree.ts';

const device = loadDevice({ archetypeId: 'inverter', slug: 'foxess_h3_ps10sh' }) as Record<
	string,
	unknown
>;

const gridEnergy = measurandCells(device).filter(
	(c) => c.feature === 'ac_phase_three_grid' && c.quantityKind === 'active_energy',
);

describe('energy channels on one active_energy column', () => {
	test('the grid active_energy column yields four interval-slug channels', () => {
		expect(gridEnergy).toHaveLength(4);
		const slugs = gridEnergy.map((c) => c.interval).sort();
		expect(slugs).toEqual(['in', 'in_daily', 'out', 'out_daily']);
	});

	test('each channel has a distinct sub-topic — no collision', () => {
		const topics = new Set(gridEnergy.map((c) => measurandSubTopic(c)));
		expect(topics.size).toBe(gridEnergy.length);
		expect(topics).toContain('ac_phase_three_grid/active_energy/out'); // feed-in lifetime
		expect(topics).toContain('ac_phase_three_grid/active_energy/in_daily'); // grid consumption today
	});

	test('registers link a channel by the interval_item triple (feature + quantity_kind + interval_id)', () => {
		const regs = (device.modbus as { modbusRegisters: Array<Record<string, unknown>> })
			.modbusRegisters;
		const energy = regs.filter(
			(r) => r.featureId === 'ac_phase_three_grid' && r.quantityKind === 'active_energy',
		);
		expect(energy).toHaveLength(4);
		const channelSlugs = new Set(gridEnergy.map((c) => c.interval));
		// ONE FK: registers carry no flow_direction/period, only the `interval_id` slug — resolves to a channel.
		for (const r of energy) {
			expect(r.flowDirection).toBeUndefined();
			expect(r.period).toBeUndefined();
			expect(r.quantity).toBeUndefined();
			expect(channelSlugs, String(r.address)).toContain(r.intervalId);
		}
	});
});
