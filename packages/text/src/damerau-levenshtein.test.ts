import { describe, expect, it } from 'vitest';
import { damerauLevenshtein } from './damerau-levenshtein.js';

describe('damerauLevenshtein', () => {
	describe('equality', () => {
		it('returns 0 steps for equal strings', () => {
			expect(damerauLevenshtein('test', 'test')).toEqual({
				steps: 0,
				relative: 0,
				similarity: 1,
			});
		});
	});

	describe('additions', () => {
		it('returns 1 step when appending one char', () => {
			expect(damerauLevenshtein('test', 'tests')).toEqual({
				steps: 1,
				relative: 1 / 5,
				similarity: 1 - 1 / 5,
			});
		});

		it('returns 1 step when prepending one char', () => {
			expect(damerauLevenshtein('test', 'stest')).toEqual({
				steps: 1,
				relative: 1 / 5,
				similarity: 1 - 1 / 5,
			});
		});

		it('returns 2 steps when appending two chars', () => {
			expect(damerauLevenshtein('test', 'mytest')).toEqual({
				steps: 2,
				relative: 2 / 6,
				similarity: 1 - 2 / 6,
			});
		});

		it('returns 7 steps when appending seven chars', () => {
			expect(damerauLevenshtein('test', 'mycrazytest')).toEqual({
				steps: 7,
				relative: 7 / 11,
				similarity: 1 - 7 / 11,
			});
		});

		it('returns 9 steps when prepending two and appending seven chars', () => {
			expect(damerauLevenshtein('test', 'mytestiscrazy')).toEqual({
				steps: 9,
				relative: 9 / 13,
				similarity: 1 - 9 / 13,
			});
		});
	});

	describe('addition of repeated chars', () => {
		it('returns 1 step when repeating a character', () => {
			expect(damerauLevenshtein('test', 'teest')).toEqual({
				steps: 1,
				relative: 1 / 5,
				similarity: 1 - 1 / 5,
			});
		});

		it('returns 2 steps when repeating a character twice', () => {
			expect(damerauLevenshtein('test', 'teeest')).toEqual({
				steps: 2,
				relative: 2 / 6,
				similarity: 1 - 2 / 6,
			});
		});
	});

	describe('deletion', () => {
		it('returns 1 step when removing one char', () => {
			expect(damerauLevenshtein('test', 'tst')).toEqual({
				steps: 1,
				relative: 1 / 4,
				similarity: 1 - 1 / 4,
			});
		});
	});

	describe('transposition', () => {
		it('returns 1 step when transposing one char', () => {
			expect(damerauLevenshtein('test', 'tset')).toEqual({
				steps: 1,
				relative: 1 / 4,
				similarity: 1 - 1 / 4,
			});
		});
	});

	describe('addition with transposition', () => {
		it('returns 2 steps when transposing one char and appending another', () => {
			expect(damerauLevenshtein('test', 'tsets')).toEqual({
				steps: 2,
				relative: 2 / 5,
				similarity: 1 - 2 / 5,
			});
		});

		it('returns 2 steps when transposing a char and repeating it', () => {
			expect(damerauLevenshtein('test', 'tsset')).toEqual({
				steps: 2,
				relative: 2 / 5,
				similarity: 1 - 2 / 5,
			});
		});
	});

	describe('transposition of multiple chars', () => {
		it('returns 1 step when transposing two neighbouring characters', () => {
			expect(damerauLevenshtein('banana', 'banaan')).toEqual({
				steps: 1,
				relative: 1 / 6,
				similarity: 1 - 1 / 6,
			});
		});

		it('returns 2 steps when transposing two neighbouring characters by two places', () => {
			expect(damerauLevenshtein('banana', 'nabana')).toEqual({
				steps: 2,
				relative: 2 / 6,
				similarity: 1 - 2 / 6,
			});
		});

		it('returns 2 steps when transposing two pairs of characters', () => {
			expect(damerauLevenshtein('banana', 'abnaan')).toEqual({
				steps: 2,
				relative: 2 / 6,
				similarity: 1 - 2 / 6,
			});
		});
	});

	// The defining property of true Damerau-Levenshtein (vs. Optimal String
	// Alignment): a transposed substring can still participate in further edits.
	// OSA would score 'ca' → 'abc' as 3 (swap ca→ac, then insert b — but OSA
	// forbids editing an already-transposed region). True DL scores it as 2.
	describe('unrestricted transposition', () => {
		it('allows further edits on a transposed substring', () => {
			expect(damerauLevenshtein('ca', 'abc').steps).toBe(2);
		});

		it('scores a cat → an act as 2 (swap + substitute)', () => {
			expect(damerauLevenshtein('a cat', 'an act').steps).toBe(2);
		});
	});

	describe('empty strings', () => {
		it('returns 0 steps and 0 relative when both are empty', () => {
			expect(damerauLevenshtein('', '')).toEqual({
				steps: 0,
				relative: 0,
				similarity: 1,
			});
		});

		it('returns steps equal to first string length when second is empty', () => {
			expect(damerauLevenshtein('test', '')).toEqual({
				steps: 4,
				relative: 1,
				similarity: 0,
			});
		});

		it('returns steps equal to second string length when first is empty', () => {
			expect(damerauLevenshtein('', 'test')).toEqual({
				steps: 4,
				relative: 1,
				similarity: 0,
			});
		});
	});
});
