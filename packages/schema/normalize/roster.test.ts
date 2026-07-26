// A `*` is a TEMPLATE: it lowers to one row per roster member, and never
// persists. Two ways it goes wrong. Over an EMPTY roster it expands to nothing,
// so the bands vanish silently — the walk refuses it. Over the PART_SET it
// invents parts the feature has not got. Written against a throwaway tree
// because both fire on authored shape, and the real catalog (rightly) contains
// no document that trips them.
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

const OUT = 'node:inverter/probe/ac-phase/out';
const STAR = `      '*': { voltage: { _: { measurement: {} } } }\n`;
const band = (part: string) => ({ node: `${OUT}/${part}/voltage/_` });

it('refuses a `*` whose feature names no parts', () => {
	expect(walk(`      $: { part_set: three-phase }\n${STAR}`)).toThrow(
		/a default needs parts to apply to/,
	);
});

// three-phase admits the line-to-line pairs; this feature claims two legs, so
// the `ab` the vocabulary allows mints nothing
it('lowers `*` over the ROSTER, not the part_set', () => {
	const [feature] = walk(`      $: { part_set: three-phase }\n${STAR}      a: {}\n      b: {}\n`)()
		.model.feature_of_interest as Record<string, unknown>[];
	expect(feature).toMatchObject({
		parts: [{ node: `${OUT}/a` }, { node: `${OUT}/b` }],
		intervals: [band('a'), band('b')],
	});
});

it('takes `count` as its own roster — nothing to name', () => {
	const [feature] = walk(`      $: { count: 2 }\n${STAR}`)().model.feature_of_interest as Record<
		string,
		unknown
	>[];
	expect(feature).toMatchObject({
		parts: [{ node: `${OUT}/1` }, { node: `${OUT}/2` }],
		intervals: [band('1'), band('2')],
	});
});

// the default states a bare band; `a` states a measured one. One row survives at
// `a/voltage/_`, and it is the authored one — a doubled path would be a duplicate
// coordinate, and a replaced one would lose the measurement.
it('yields where an explicit part already holds the path', () => {
	const [feature] = walk(
		`      $: { part_set: three-phase }\n      '*': { voltage: { _: {} } }\n` +
			`      a: { voltage: { _: { measurement: {} } } }\n      b: {}\n`,
	)().model.feature_of_interest as Record<string, unknown>[];
	expect(feature).toMatchObject({
		intervals: [band('a'), band('b')],
		measurements: [band('a')],
	});
});

// `_` names no part, so it never expands and a combined band cannot collide
// with a per-part one
it('leaves `_` beside the expansion', () => {
	const [feature] = walk(
		`      $: { part_set: three-phase }\n${STAR}      _: { voltage: { _: {} } }\n      a: {}\n`,
	)().model.feature_of_interest as Record<string, unknown>[];
	expect(feature).toMatchObject({ intervals: [band('_'), band('a')] });
});
