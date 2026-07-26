// The two flattening shapes are the whole contract between a rows bundle and
// the tables — everything else in load.ts is binding and transactions. Assert
// them on real schema classes, so a schema edit that moves a slot's range or
// drops a `sql_table` fails here rather than as a mystery FK error at build.
import { expect, it } from 'vitest';
import { inserts } from './load.ts';

const FEATURE = 'node:inverter/x/ac-phase/out';
const INTERVAL = 'node:inverter/x/ac-phase/out/_/voltage/running';

const bundle = {
	feature_of_interests: [
		{
			node: FEATURE,
			feature_type: 'node:feature-type/ac-phase',
			role: 'out',
			intervals: [
				{
					node: INTERVAL,
					part: '_',
					quantity_kind: 'node:quantity-kind/voltage',
					valued_range: { node: INTERVAL, min: 220, max: 240 },
				},
			],
		},
	],
};

const rowIn = (table: string) => inserts(bundle).find((i) => i.table === table)?.row;

it('lands one row per table, nesting consumed', () => {
	expect(inserts(bundle).map((i) => i.table)).toEqual([
		'valued_range',
		'interval',
		'feature_of_interest',
	]);
});

it('an inlined LIST child carries a backref to its parent table', () => {
	expect(rowIn('interval')).toMatchObject({ feature_of_interest_node: FEATURE });
	expect(rowIn('feature_of_interest')).not.toHaveProperty('intervals');
});

it('an inlined SINGLE child gets a forward FK on the parent, named for the slot', () => {
	expect(rowIn('interval')).toMatchObject({ valued_range_node: INTERVAL });
	expect(rowIn('interval')).not.toHaveProperty('valued_range');
	expect(rowIn('valued_range')).toMatchObject({ min: 220, max: 240 });
});

it('a string at an FK slot stays a reference, never an inlined row', () => {
	expect(rowIn('feature_of_interest')).toMatchObject({
		feature_type: 'node:feature-type/ac-phase',
	});
	expect(inserts(bundle).some((i) => i.table === 'feature_type')).toBe(false);
});

it('rejects a slot the Catalog container does not declare', () => {
	expect(() => inserts({ widgets: [{ node: 'node:widget/x' }] })).toThrow(/not a Catalog row-set/);
});
