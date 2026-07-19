// The grimoire CLI reads the baked artifacts/ JSON — the shell-side twin of the TS query surface.
import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');
const run = (...args: string[]): string =>
	execFileSync('node', [CLI, ...args], { encoding: 'utf8' });

describe('grimoire CLI', () => {
	test('catalog lists identities', () => {
		expect(run('catalog')).toContain('inverter\tfoxess_h3_ps10sh');
	});

	test('a dotted path selects a node of an entry', () => {
		const node = JSON.parse(
			run('catalog', 'foxess_h3_ps10sh', 'ac_phase_three_grid.identity.slug'),
		) as string;
		expect(node).toBe('ac_grid');
	});

	test('a quantity_kind column filter selects its registers, keyed by the interval_id slug', () => {
		const regs = JSON.parse(run('registers', 'foxess_h3_ps10sh', 'active_energy')) as Array<
			Record<string, unknown>
		>;
		// grid feed-in/consumption ×2, port yield/input ×2, pv lifetime+daily, load lifetime+daily.
		const grid = regs.filter((r) => r.feature_id === 'ac_phase_three_grid');
		expect(grid).toHaveLength(4);
		const feedInDaily = grid.find((r) => r.interval_id === 'out_daily');
		expect(feedInDaily?.address).toBe(39615);
	});

	test('an unknown slug fails with the valid set', () => {
		expect(() => run('catalog', 'nope')).toThrow();
	});

	test('concept commands list slug<TAB>title and dump a node', () => {
		expect(run('feature')).toContain('interval\t');
		const desc = JSON.parse(run('feature', 'interval', 'description')) as { en: string };
		expect(desc.en).toBeTruthy();
	});

	test('archetype exposes the intervals item-type slots', () => {
		const slots = JSON.parse(run('archetype', 'intervals', 'array.prop')) as Record<
			string,
			unknown
		>;
		expect(Object.keys(slots)).toContain('interval');
	});

	test('schema dumps the JSON Schema twin', () => {
		const s = JSON.parse(run('schema', 'feature', 'interval')) as Record<string, unknown>;
		expect(s.$defs ?? s.properties).toBeTruthy();
	});

	test('help flags print usage to stdout and exit 0', () => {
		for (const flag of ['help', '-h', '--help']) expect(run(flag)).toContain('grimoire —');
	});

	test('an unknown command exits non-zero', () => {
		expect(() => run('bogus')).toThrow();
	});
});
