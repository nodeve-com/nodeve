import { describe, expect, it } from 'vitest';
import { wrapText } from './wrap-text.ts';

describe('wrapText', () => {
	it('keeps short text on one line', () => {
		expect(wrapText('Lights', 10)).toEqual(['Lights']);
	});

	it('wraps on word boundaries to fit the width', () => {
		expect(wrapText('Kitchen Sockets', 8)).toEqual(['Kitchen', 'Sockets']);
	});

	it('packs as many words per line as fit', () => {
		expect(wrapText('a b c d e', 5)).toEqual(['a b c', 'd e']);
	});

	it('never splits a word wider than the budget — it overflows its own line', () => {
		expect(wrapText('Refrigerator', 5)).toEqual(['Refrigerator']);
	});

	it('collapses whitespace runs and trims', () => {
		expect(wrapText('  Oven   Hob  ', 20)).toEqual(['Oven Hob']);
	});

	it('returns [] for blank input', () => {
		expect(wrapText('   ', 10)).toEqual([]);
	});
});
