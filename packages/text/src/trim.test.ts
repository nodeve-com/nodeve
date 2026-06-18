import { describe, expect, it } from 'vitest';
import { trimText } from './trim.js';

describe('trimText', () => {
	it('returns input unchanged when already within max', () => {
		expect(trimText('Short text.', { max: 100 })).toBe('Short text.');
	});

	it('collapses runs of whitespace', () => {
		expect(trimText('a\n\n  b   c', { max: 100 })).toBe('a b c');
	});

	it('trims leading and trailing whitespace', () => {
		expect(trimText('  hello  ', { max: 100 })).toBe('hello');
	});

	it('cuts at the last sentence boundary within max', () => {
		const input =
			'First sentence. Second sentence. Third sentence runs over the cap by quite a bit.';
		expect(trimText(input, { max: 40 })).toBe('First sentence. Second sentence.');
	});

	it('honors ! and ? as sentence boundaries', () => {
		expect(trimText('Wow! That works. More text follows here for sure.', { max: 20 })).toBe(
			'Wow! That works.',
		);
	});

	it('falls back to word boundary when sentence end is too early', () => {
		const input = 'Hi. ' + 'word '.repeat(30);
		const out = trimText(input, { max: 50 });
		expect(out.endsWith('…')).toBe(true);
		expect(out.length).toBeLessThanOrEqual(51);
		expect(out).not.toMatch(/word$/);
	});

	it('uses the configured ellipsis', () => {
		const input = 'one two three four five six seven eight nine ten eleven twelve';
		expect(trimText(input, { max: 20, ellipsis: '...' }).endsWith('...')).toBe(true);
	});

	it('cuts mid-word only when there is no whitespace within the slice', () => {
		const input = 'a'.repeat(100);
		expect(trimText(input, { max: 10 })).toBe('aaaaaaaaaa…');
	});
});
