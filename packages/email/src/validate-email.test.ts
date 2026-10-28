import { describe, expect, it } from 'vitest';
import { parseEmailShape, validateEmailAddress } from './validate-email.js';

describe('parseEmailShape', () => {
	it('accepts a valid address and returns the normalized (lowercased) form', () => {
		// zod's `.email()` rejects surrounding whitespace before the transform
		// fires, so the normalize step here is effectively just lowercase. The
		// transform still exists for parity with the user-facing pipeline.
		const result = parseEmailShape('Foo.Bar@Example.COM');
		expect(result).toEqual({ ok: true, email: 'foo.bar@example.com' });
	});

	// The whole reason this function exists separately from
	// `validateEmailAddress` — persistence boundaries (inbound-mail upserts)
	// want to record real addresses from disposable/blocked/placeholder
	// sources, only rejecting input that's syntactically un-storable.
	it('accepts a disposable address (no blocklist layer applied)', () => {
		expect(parseEmailShape('alice@0-mail.com')).toEqual({
			ok: true,
			email: 'alice@0-mail.com',
		});
	});

	it('accepts a typo-squat blocked-domain address (no blocklist layer applied)', () => {
		expect(parseEmailShape('alice@aol.cmo')).toEqual({
			ok: true,
			email: 'alice@aol.cmo',
		});
	});

	it('accepts a placeholder address (no placeholder layer applied)', () => {
		const placeholder = 'user-123@forgotten.mailchimp.com';
		expect(parseEmailShape(placeholder)).toEqual({
			ok: true,
			email: placeholder,
		});
	});

	// Real-world failure that motivated this helper: malformed `To:` group
	// labels reaching the envelope-from fallback in apps/email/src/migrate.ts.
	// The DB-side `email_sync_domain` trigger splits on `@` and would seed
	// `domain.name = ''`, violating the NOT NULL on `labels_rtl`.
	it('rejects an address with no `@` (group label like `undisclosed-recipients:`)', () => {
		expect(parseEmailShape('undisclosed-recipients:')).toEqual({
			ok: false,
			verdict: { reason: 'invalid-syntax', message: expect.any(String) },
		});
	});

	it('rejects an empty string', () => {
		const result = parseEmailShape('');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.verdict.reason).toBe('invalid-syntax');
	});

	it('rejects a non-string input', () => {
		const result = parseEmailShape(undefined);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.verdict.reason).toBe('invalid-syntax');
	});

	it('rejects an address over 254 chars', () => {
		const local = 'a'.repeat(250);
		const result = parseEmailShape(`${local}@example.com`);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.verdict.reason).toBe('invalid-syntax');
	});
});

describe('validateEmailAddress', () => {
	it('layers blocklist/disposable/placeholder rejections on top of the shape check', () => {
		// Confirms the refactor preserved the full pipeline — parseEmailShape
		// would accept these, validateEmailAddress must still reject.
		const disposable = validateEmailAddress('alice@0-mail.com');
		expect(disposable.ok).toBe(false);
		if (!disposable.ok) expect(disposable.verdict.reason).toBe('disposable');

		const placeholder = validateEmailAddress('u@forgotten.mailchimp.com');
		expect(placeholder.ok).toBe(false);
		if (!placeholder.ok) expect(placeholder.verdict.reason).toBe('placeholder');

		const typoSquat = validateEmailAddress('alice@aol.cmo');
		expect(typoSquat.ok).toBe(false);
		if (!typoSquat.ok) {
			expect(typoSquat.verdict.reason).toBe('blocklist-typo');
			expect(typoSquat.verdict.suggestion).toBe('alice@aol.com');
		}
	});

	it('still surfaces shape errors with `invalid-syntax`', () => {
		const result = validateEmailAddress('not-an-email');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.verdict.reason).toBe('invalid-syntax');
	});

	it('accepts a clean address and returns the normalized form', () => {
		expect(validateEmailAddress('Alice@Example.com')).toEqual({
			ok: true,
			email: 'alice@example.com',
		});
	});
});

describe('validateEmailAddress options', () => {
	it('rejects the app’s own placeholder domain when passed', () => {
		const result = validateEmailAddress('u@forgotten.example.org', {
			placeholderDomains: ['forgotten.example.org'],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.verdict.reason).toBe('placeholder');
		expect(validateEmailAddress('u@forgotten.example.org').ok).toBe(true);
	});
});
