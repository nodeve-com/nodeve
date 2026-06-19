import { describe, expect, it } from 'vitest';
import { SHORT_CODE_LENGTH, shortCode } from './short-code.js';

describe('shortCode', () => {
	it('produces an 8-character code', () => {
		expect(shortCode('hello').length).toBe(SHORT_CODE_LENGTH);
		expect(shortCode('')).toHaveLength(SHORT_CODE_LENGTH);
	});

	it('is deterministic for the same input', () => {
		expect(shortCode('nodeve')).toBe(shortCode('nodeve'));
	});

	it('treats a string and its UTF-8 bytes identically', () => {
		const text = 'café';
		expect(shortCode(text)).toBe(shortCode(new TextEncoder().encode(text)));
	});

	it('differs for different inputs', () => {
		expect(shortCode('a')).not.toBe(shortCode('b'));
	});

	it('uses only the unambiguous Crockford alphabet', () => {
		for (const seed of ['a', 'hello world', '🎉', '0'.repeat(100)]) {
			expect(shortCode(seed)).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
		}
	});
});
