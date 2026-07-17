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

	test('quantity member resolves its base kind', () => {
		const member = JSON.parse(run('quantity', 'feed_in_energy')) as {
			measures: { quantity_kind: string };
		};
		expect(member.measures.quantity_kind).toBe('active_energy');
	});

	test('a column filter selects one register, carrying the baked base kind', () => {
		const regs = JSON.parse(run('registers', 'foxess_h3_ps10sh', 'feed_in_energy')) as Array<
			Record<string, unknown>
		>;
		expect(regs).toHaveLength(1);
		expect(regs[0]!.quantity_kind).toBe('active_energy');
	});

	test('an unknown slug fails with the valid set', () => {
		expect(() => run('catalog', 'nope')).toThrow();
	});
});
