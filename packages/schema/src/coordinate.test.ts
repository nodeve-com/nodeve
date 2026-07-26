// The `coordinate` view is SQL, so only SQL proves it. `check:db` runs it over
// the real catalog; these are the behaviours that tree never exercises — `count`
// expanding past its first ordinal, and an explicit part outranking the `*`
// default instead of colliding with it.
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { abs, exists, read } from './io.ts';
import { load, type Bundle } from './load.ts';

const DDL = abs('gen/nodeve.sqlite.sql');
if (!exists(DDL)) throw new Error(`missing ${DDL} — run: pnpm project`);

const SET = 'node:part-set/two-phase';
const TRACKER = 'node:inverter/x/dc-port/pv-tracker';
const PHASE = 'node:inverter/x/ac-phase/out';
const VOLTAGE = 'node:quantity-kind/voltage';

/** one interval row, its path assembled the way the normalizer mints it */
const band = (feature: string, part: string, slug: string) => ({
	node: `${feature}/${part}/voltage/${slug}`,
	part,
	quantity_kind: VOLTAGE,
});

const bundle: Bundle = {
	// members carry no slug column — the view reads it off their node row
	nodes: [`${SET}/a`, `${SET}/b`].map((permalink) => ({
		permalink,
		slug: permalink.split('/').at(-1),
	})),
	part_sets: [
		{
			node: SET,
			feature_type: 'node:feature-type/ac-phase',
			part_set_members: [
				{ node: `${SET}/a`, ordinal: 1 },
				{ node: `${SET}/b`, ordinal: 2 },
			],
		},
	],
	feature_of_interests: [
		{
			node: TRACKER,
			feature_type: 'node:feature-type/dc-port',
			role: 'pv-tracker',
			count: 3,
			intervals: [band(TRACKER, '*', '_')],
		},
		{
			node: PHASE,
			feature_type: 'node:feature-type/ac-phase',
			role: 'out',
			part_set: SET,
			// `_` is not a part, so it survives the expansion beside it; `b` states
			// its own running band, which the default must not restate
			intervals: [band(PHASE, '*', 'running'), band(PHASE, '_', '_'), band(PHASE, 'b', 'running')],
		},
	],
};

const db = new DatabaseSync(':memory:');
db.exec(read(DDL));
load(db, bundle);

/** the view's rows under one feature as `resolved ← template` tails, sorted. A
 * list, not a map: a map would silently swallow the duplicate the precedence
 * clause exists to prevent. */
const under = (feature: string) =>
	(
		db
			.prepare(`SELECT node, interval FROM coordinate WHERE node LIKE ? ORDER BY node`)
			.all(`${feature}/%`) as { node: string; interval: string }[]
	).map((r) => `${r.node.slice(feature.length + 1)} ← ${r.interval.slice(feature.length + 1)}`);

it('expands `*` to every ordinal of a `count` feature', () => {
	expect(under(TRACKER)).toEqual([
		'1/voltage/_ ← */voltage/_',
		'2/voltage/_ ← */voltage/_',
		'3/voltage/_ ← */voltage/_',
	]);
});

it('expands `*` to every `part_set` member; an explicit part wins, `_` is untouched', () => {
	expect(under(PHASE)).toEqual([
		'_/voltage/_ ← _/voltage/_',
		'a/voltage/running ← */voltage/running',
		'b/voltage/running ← b/voltage/running',
	]);
});
