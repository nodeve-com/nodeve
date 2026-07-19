// bakeSite × site-authored feature_spec deltas: a site block naming a measurand feature (a custom
// `intervals` band on a quantity) must MERGE into that feature's generated slug patch — never
// clobber it — and the read-side overlay must land it on the device tree beside the catalog bands.
import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bakeSite } from '../src/bake-site.ts';
import { linkRegisters, openSite } from '../src/site-view.ts';
import { modbusMediumOf } from '../src/catalog.ts';
import type { AcPhaseThreePoint } from '../src/generated/features/ac_phase_three_point.ts';

const REF = { archetype_id: 'ac_phase_three_meter', slug: 'grid_meter_live' };

function fixtureSite(filterMs = 1000): string {
	const dir = mkdtempSync(join(tmpdir(), 'grimoire-bake-'));
	mkdirSync(join(dir, 'catalog'));
	mkdirSync(join(dir, 'adapter'));
	writeFileSync(
		join(dir, 'catalog', '_defaults.yaml'),
		'identity:\n  archetype_id: site_catalog\n',
	);
	writeFileSync(
		join(dir, 'catalog', 'grid_meter_live.yaml'),
		[
			'inventory:',
			'  catalog_item:',
			'    archetype_id: ac_phase_three_meter',
			'    slug: chint_dtsu666_4wire',
			'ac_phase_three_point:',
			'  feature_spec:',
			'    combined:',
			'      active_power:',
			'        intervals:',
			'          - identity: { slug: grid_neutral }',
			'            interval: { min: -50, max: 50 }',
			`            filter: { throttle_average_ms: ${filterMs} }`,
			'    part:',
			'      a:',
			'        voltage:',
			'          intervals:',
			'            - identity: { slug: brownout }',
			'              interval: { min: 190, max: 253 }',
			'',
		].join('\n'),
	);
	writeFileSync(
		join(dir, 'adapter', 'grid_meter_live.yaml'),
		[
			'identity:',
			'  archetype_id: site_adapter',
			'ingest:',
			'  ingest_kind: modbus_tap',
			'  platform: esphome',
			'  catalog_item:',
			'    archetype_id: ac_phase_three_meter',
			'    slug: grid_meter_live',
			'modbus_tap_window:',
			'  - name: telemetry',
			'    address: 5392',
			'    observed_interval_ms: 200',
			'',
		].join('\n'),
	);
	return dir;
}

// A catalog entry referencing a device whose measurable intervals ALREADY carry `identity.slug`
// handles on the raw catalog (the ps10sh grid CT's directional energy channels: out/out_daily/
// in/in_daily). The generated slug patch must LAND on those base intervals — the read-side overlay
// matches array elements by `identity.slug`, so the patch has to preserve each interval's handle as
// its match key while stamping the qualified sensor id, or the patch appends beside the base
// interval instead of merging onto it and the channel reads back slugless.
function inverterSite(): string {
	const dir = mkdtempSync(join(tmpdir(), 'grimoire-bake-inv-'));
	mkdirSync(join(dir, 'catalog'));
	writeFileSync(
		join(dir, 'catalog', '_defaults.yaml'),
		'identity:\n  archetype_id: site_catalog\n',
	);
	writeFileSync(
		join(dir, 'catalog', 'grid_inverter.yaml'),
		[
			'inventory:',
			'  catalog_item:',
			'    archetype_id: inverter',
			'    slug: foxess_h3_ps10sh',
			'',
		].join('\n'),
	);
	return dir;
}

describe('bakeSite — slugged measurable intervals (directional energy channels)', () => {
	const INV = { archetype_id: 'inverter', slug: 'grid_inverter' };
	const site = openSite(bakeSite(inverterSite(), 'inv-fixture'));

	const gridEnergy = () =>
		site
			.sensors(INV)
			.filter((s) => s.featureId === 'ac_phase_three_grid' && s.quantityKind === 'active_energy');

	test('the four directional energy channels read back with baked slugs (no slugless append)', () => {
		const channels = gridEnergy();
		expect(channels.map((c) => c.intervalId).sort()).toEqual([
			'in',
			'in_daily',
			'out',
			'out_daily',
		]);
		// every channel carries BOTH ids — the bug left these undefined and threw "no slug".
		expect(channels.map((c) => c.slug).sort()).toEqual([
			'ac_grid_active_energy_in',
			'ac_grid_active_energy_in_daily',
			'ac_grid_active_energy_out',
			'ac_grid_active_energy_out_daily',
		]);
		expect(channels.map((c) => c.slugQualified).sort()).toEqual([
			'grid_inverter_ac_grid_active_energy_in',
			'grid_inverter_ac_grid_active_energy_in_daily',
			'grid_inverter_ac_grid_active_energy_out',
			'grid_inverter_ac_grid_active_energy_out_daily',
		]);
	});

	test('linkRegisters pairs each energy register with its distinct channel sensor (no re-spelled coord)', () => {
		const { merged } = site.resolve(INV);
		const links = linkRegisters(modbusMediumOf(merged).modbusRegisters, site.sensors(INV));
		const energy = links.filter(
			(l) =>
				l.register.featureId === 'ac_phase_three_grid' &&
				l.register.quantityKind === 'active_energy',
		);
		expect(energy).toHaveLength(4);
		// every energy register resolves to a sensor, and the four map to four DISTINCT slugs.
		const slugs = energy.map((l) => l.sensor?.slug);
		expect(slugs.every((s) => typeof s === 'string')).toBe(true);
		expect(new Set(slugs).size).toBe(4);
		expect(slugs.sort()).toEqual([
			'ac_grid_active_energy_in',
			'ac_grid_active_energy_in_daily',
			'ac_grid_active_energy_out',
			'ac_grid_active_energy_out_daily',
		]);
	});

	test('a slugless single channel (active_power) keeps an undefined interval handle', () => {
		const power = site
			.sensors(INV)
			.filter((s) => s.featureId === 'ac_phase_three_grid' && s.quantityKind === 'active_power');
		const combined = power.find((s) => s.partId === undefined && s.ordinal === undefined);
		expect(combined?.intervalId).toBeUndefined();
		expect(combined?.slug).toBe('ac_grid_active_power');
	});
});

describe('bakeSite — site-authored intervals merge into the slug patch', () => {
	const bundle = bakeSite(fixtureSite(), 'fixture');
	const site = openSite(bundle);

	test('baked slugs survive a site block on the same feature', () => {
		const sensors = site.sensors(REF);
		expect(sensors.map((s) => s.slugQualified)).toContain('grid_meter_live_ac_active_power');
	});

	const featureSpec = (): NonNullable<AcPhaseThreePoint['featureSpec']> => {
		const { merged } = site.resolve(REF);
		const feature = (merged as { acPhaseThreePoint?: AcPhaseThreePoint }).acPhaseThreePoint;
		const spec = feature?.featureSpec;
		if (!spec) throw new Error('acPhaseThreePoint.featureSpec missing on merged device');
		return spec;
	};

	test('a combined custom interval lands beside the catalog bands', () => {
		const slugs = featureSpec().combined?.activePower?.intervals?.map((b) => b.identity?.slug);
		expect(slugs).toContain('grid_neutral');
	});

	test('a per-leg custom interval appends to the leg it names, and only that leg', () => {
		const slugsAt = (leg: 'a' | 'b'): (string | undefined)[] =>
			featureSpec().part?.[leg]?.voltage?.intervals?.map((b) => b.identity?.slug) ?? [];
		expect(slugsAt('a')).toContain('brownout');
		expect(slugsAt('a')).toContain('nominal_eu_230v_50hz'); // catalog bands intact
		expect(slugsAt('b')).not.toContain('brownout');
	});

	test('an interval filter window rides the merge (the band claims the conditioned signal)', () => {
		const band = featureSpec().combined?.activePower?.intervals?.find(
			(b) => b.identity?.slug === 'grid_neutral',
		);
		expect(band?.filter?.throttleAverageMs).toBe(1000);
	});

	test('a filter window shorter than the adapter cadence fails the bake', () => {
		expect(() => bakeSite(fixtureSite(100), 'fixture')).toThrow(
			/filter window shorter than the sample interval/,
		);
	});
});
