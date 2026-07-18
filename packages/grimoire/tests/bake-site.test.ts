// bakeSite × site-authored feature_spec deltas: a site block naming a measurand feature (a custom
// `intervals` band on a quantity) must MERGE into that feature's generated slug patch — never
// clobber it — and the read-side overlay must land it on the device tree beside the catalog bands.
import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bakeSite } from '../src/bake-site.ts';
import { openSite } from '../src/site-view.ts';
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
