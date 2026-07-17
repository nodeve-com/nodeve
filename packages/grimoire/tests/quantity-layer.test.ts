// The `quantity` layer (a valued qudt:Quantity over a base quantity_kind): a NAMED measurand column
// coexists with same-kind siblings on one feature, emitting its OWN slug as the sensor-id/topic
// segment while its metrology resolves from the base kind. Exercised against the real ps10sh entry,
// whose grid CT carries feed-in vs grid-consumption energy (both active_energy).
import { describe, expect, test } from 'vitest';
import { QUANTITY, baseQuantityKind } from '../src/index.ts';
import { loadDevice } from '../src/catalog.ts';
import { measurandCells, measurandSubTopic } from '../src/measurand-tree.ts';

describe('quantity layer', () => {
	test('a named quantity references its base kind', () => {
		expect(QUANTITY.dict['feed_in_energy']?.measures?.quantityKind).toBe('active_energy');
		expect(QUANTITY.dict['grid_consumption_energy']?.measures?.quantityKind).toBe('active_energy');
		expect(baseQuantityKind('feed_in_energy')).toBe('active_energy'); // resolves to the kind
		expect(baseQuantityKind('active_power')).toBe('active_power'); // a bare kind is itself
	});

	test('feed-in and grid-consumption energy are distinct columns on one feature', () => {
		const device = loadDevice({ archetypeId: 'inverter', slug: 'foxess_h3_ps10sh' }) as Record<
			string,
			unknown
		>;
		const cells = measurandCells(device);
		const gridEnergy = cells.filter(
			(c) =>
				c.feature === 'ac_phase_three_grid' && baseQuantityKind(c.quantityKind) === 'active_energy',
		);
		const cols = gridEnergy.map((c) => c.quantityKind).sort();
		// Two directional lifetime + two daily channels — NOT collapsed onto one active_energy.
		expect(cols).toContain('feed_in_energy');
		expect(cols).toContain('grid_consumption_energy');
		// Each yields its OWN sub-topic segment — no collision.
		const topics = new Set(gridEnergy.map((c) => measurandSubTopic(c)));
		expect(topics.size).toBe(gridEnergy.length);
		expect(topics).toContain('ac_phase_three_grid/feed_in_energy');
	});

	test('registers carrying a named quantity also carry the baked base kind', () => {
		const device = loadDevice({ archetypeId: 'inverter', slug: 'foxess_h3_ps10sh' });
		const regs = (device.modbus as { modbusRegisters: Array<Record<string, unknown>> })
			.modbusRegisters;
		const named = regs.filter((r) => typeof r.quantity === 'string');
		expect(named.length).toBeGreaterThan(0);
		// A JSON reader routes on the baked kind without the TS enumeration module.
		for (const r of named)
			expect(r.quantityKind, String(r.quantity)).toBe(baseQuantityKind(r.quantity as string));
	});
});
