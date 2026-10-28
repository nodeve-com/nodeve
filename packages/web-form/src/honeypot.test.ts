import { describe, expect, it } from 'vitest';
import { HONEYPOT_FIELD, isHoneypotFilled } from './honeypot.js';

describe('isHoneypotFilled', () => {
	it('flags a filled field in FormData or a plain object', () => {
		const form = new FormData();
		form.set(HONEYPOT_FIELD, 'https://spam.example');
		expect(isHoneypotFilled(form)).toBe(true);
		expect(isHoneypotFilled({ [HONEYPOT_FIELD]: 'x' })).toBe(true);
	});

	it('passes an empty or missing field', () => {
		const form = new FormData();
		form.set(HONEYPOT_FIELD, '');
		expect(isHoneypotFilled(form)).toBe(false);
		expect(isHoneypotFilled({})).toBe(false);
	});
});
