// A `*` over an empty roster is SILENT data loss — it expands to nothing, so the
// bands vanish instead of landing wrong. The walk has to refuse it. Written
// against a throwaway tree because the check fires on authored shape, and the
// real catalog (rightly) contains no document that trips it.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { normalizeDevice } from './tree.ts';

/** a `subject_node/inverter/probe.yaml` holding one ac-phase feature — the walk
 * reads its class off the grandparent dir and its node type off the parent */
const walk = (feature: string) => {
	const dir = join(mkdtempSync(join(tmpdir(), 'nodeve-roster-')), 'subject_node', 'inverter');
	mkdirSync(dir, { recursive: true });
	const file = join(dir, 'probe.yaml');
	writeFileSync(file, `feature_of_interest:\n  ac-phase:\n    out:\n${feature}`);
	return () => normalizeDevice(file, () => {});
};

const STAR = `      '*': { voltage: { _: { measurement: {} } } }\n`;

it('refuses a `*` whose feature names no parts', () => {
	expect(walk(`      $: { part_set: three-phase }\n${STAR}`)).toThrow(
		/a default needs parts to apply to/,
	);
});

it('accepts the same `*` once the roster is named, empty blocks and all', () => {
	const rows = walk(`      $: { part_set: three-phase }\n${STAR}      a: {}\n      b: {}\n`)();
	expect(rows.model.feature_of_interest).toMatchObject([
		{
			parts: [
				{ node: 'node:inverter/probe/ac-phase/out/a' },
				{ node: 'node:inverter/probe/ac-phase/out/b' },
			],
		},
	]);
});

it('takes `count` as its own roster — nothing to name', () => {
	const rows = walk(`      $: { count: 2 }\n${STAR}`)();
	expect(rows.model.feature_of_interest).toMatchObject([
		{
			parts: [
				{ node: 'node:inverter/probe/ac-phase/out/1' },
				{ node: 'node:inverter/probe/ac-phase/out/2' },
			],
		},
	]);
});
