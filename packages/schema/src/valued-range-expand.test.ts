import { describe, expect, it } from 'vitest';
import type { ValuedRange } from '../gen/schema.ts';
import { expandValuedRange } from './valued-range-expand.ts';

const expand = (range: Partial<ValuedRange>) => expandValuedRange(range as ValuedRange, 'test');

describe('expandValuedRange', () => {
	it('leaves a value-only range untouched', () => {
		const r = { value: 10 };
		expect(expand(r)).toBe(r);
	});

	it('leaves a range with no value untouched', () => {
		const r = { tolerance: 2 };
		expect(expand(r)).toBe(r);
	});

	it('leaves a fully bounded range untouched', () => {
		const r = { value: 10, min: 9, max: 11, tolerance: 2 };
		expect(expand(r)).toBe(r);
	});

	it('tolerance is an absolute symmetric band', () => {
		expect(expand({ value: 10, tolerance: 2 })).toEqual({
			value: 10,
			tolerance: 2,
			min: 8,
			max: 12,
		});
	});

	it('asymmetric tolerance bands each edge independently', () => {
		expect(expand({ value: 10, tolerance_lower: 1, tolerance_upper: 3 })).toMatchObject({
			min: 9,
			value: 10,
			max: 13,
		});
	});

	it('margin scales relative to value', () => {
		expect(expand({ value: 100, margin: 0.05 })).toMatchObject({ min: 95, max: 105 });
	});

	it('asymmetric margin scales each edge independently', () => {
		expect(expand({ value: 200, margin_lower: 0.1, margin_upper: 0.25 })).toMatchObject({
			min: 180,
			max: 250,
		});
	});

	it('only fills the missing edge when one bound is authored', () => {
		expect(expand({ value: 10, min: 9, tolerance_upper: 3 })).toEqual({
			value: 10,
			min: 9,
			tolerance_upper: 3,
			max: 13,
		});
	});

	it('rejects two bands on one edge', () => {
		expect(() => expand({ value: 10, tolerance_lower: 1, margin_lower: 0.1 })).toThrow(
			'one band per edge',
		);
	});

	it('rejects a negative band', () => {
		expect(() => expand({ value: 10, tolerance: -1 })).toThrow('non-negative');
	});
});
