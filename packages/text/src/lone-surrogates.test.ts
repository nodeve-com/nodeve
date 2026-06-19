import { describe, expect, it } from 'vitest';
import { replaceLoneSurrogates, replaceLoneSurrogatesDeep } from './lone-surrogates.ts';

describe('replaceLoneSurrogates', () => {
	it('returns input unchanged when there are no surrogates', () => {
		expect(replaceLoneSurrogates('hello world')).toBe('hello world');
	});

	it('preserves valid surrogate pairs (full emoji code points)', () => {
		const pin = '📍';
		expect(replaceLoneSurrogates(`see ${pin} here`)).toBe(`see ${pin} here`);
	});

	it('replaces a lone high surrogate with U+FFFD', () => {
		expect(replaceLoneSurrogates('cut\uD83D&rest')).toBe('cut�&rest');
	});

	it('replaces a lone low surrogate with U+FFFD', () => {
		expect(replaceLoneSurrogates('cut\uDCCDrest')).toBe('cut�rest');
	});

	it('handles a high surrogate at end of string', () => {
		expect(replaceLoneSurrogates('ends with \uD83D')).toBe('ends with �');
	});

	it('handles a low surrogate at start of string', () => {
		expect(replaceLoneSurrogates('\uDCCD starts here')).toBe('� starts here');
	});

	it('replaces multiple lone surrogates independently', () => {
		expect(replaceLoneSurrogates('\uD83Da\uDCCDb\uD83D')).toBe('�a�b�');
	});
});

describe('replaceLoneSurrogatesDeep', () => {
	it('cleans strings nested inside plain objects and arrays', () => {
		const input = {
			body: 'safe',
			items: ['\uD83D bad', '📍 ok'],
			nested: { md: 'tail\uD83D' },
		};
		expect(replaceLoneSurrogatesDeep(input)).toEqual({
			body: 'safe',
			items: ['� bad', '📍 ok'],
			nested: { md: 'tail�' },
		});
	});

	it('passes through non-string leaves', () => {
		const input = { n: 42, b: true, x: null, u: undefined };
		expect(replaceLoneSurrogatesDeep(input)).toEqual(input);
	});

	it('passes Date instances through by reference', () => {
		const d = new Date(0);
		const out = replaceLoneSurrogatesDeep({ at: d, label: '\uD83D' });
		expect(out.at).toBe(d);
		expect(out.label).toBe('�');
	});

	it('does not mutate the input', () => {
		const input = { md: 'tail\uD83D' };
		const out = replaceLoneSurrogatesDeep(input);
		expect(input.md).toBe('tail\uD83D');
		expect(out.md).toBe('tail�');
	});
});
