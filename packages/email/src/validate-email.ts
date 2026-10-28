import { z } from 'zod';
import { domainOf, normalizeEmail } from './normalize.js';
import { isBlockedDomain, isBlockedTld } from './blocklist.js';
import { isDisposableEmail } from './disposable.js';
import { isPlaceholderEmail, PLACEHOLDER_DOMAINS } from './placeholder.js';
import { suggestDomain } from './suggest-domain.js';

/**
 * Sync email-address validation. Pure, client-safe: every surface that
 * accepts an email runs this first; remote verification and persistence
 * are the caller's.
 *
 * The verdict on failure is a structured `{ reason, message, suggestion? }`
 * so downstream layers (DB persistence, admin reports, service workers)
 * can act on the machine-readable `reason` rather than parsing error
 * strings. The user-facing `message` stays stable for form UIs.
 */

const emailShape = z
	.email('Please enter a valid email address.')
	.max(254, 'Email is too long.')
	.transform(normalizeEmail);

export type EmailInvalidReason =
	| 'invalid-syntax'
	| 'tld-blocked'
	| 'blocklist-typo'
	| 'blocklist-other'
	| 'disposable'
	| 'placeholder';

export const EMAIL_INVALID_REASONS = [
	'invalid-syntax',
	'tld-blocked',
	'blocklist-typo',
	'blocklist-other',
	'disposable',
	'placeholder',
] as const satisfies readonly EmailInvalidReason[];

export type EmailVerdict = {
	reason: EmailInvalidReason;
	message: string;
	suggestion?: string;
};

export type ValidateEmailOptions = {
	/** Extra placeholder domains (the app's own), on top of `PLACEHOLDER_DOMAINS`. */
	placeholderDomains?: readonly string[];
	/** Typo-suggestion pool for blocked domains; see `suggestDomain`. */
	candidates?: Iterable<string>;
};

export type ValidateEmailResult =
	{ ok: true; email: string } | { ok: false; verdict: EmailVerdict };

/**
 * Syntactic shape check + normalize, without the reject lists. For storing
 * observed addresses (disposable ones included) where only malformed input
 * must be refused; user-facing input goes through `validateEmailAddress`.
 */
export function parseEmailShape(raw: unknown): ValidateEmailResult {
	const parsed = emailShape.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			verdict: {
				reason: 'invalid-syntax',
				message: parsed.error.issues[0]?.message ?? 'Invalid email.',
			},
		};
	}
	return { ok: true, email: parsed.data };
}

export function validateEmailAddress(
	raw: unknown,
	options: ValidateEmailOptions = {},
): ValidateEmailResult {
	const shape = parseEmailShape(raw);
	if (!shape.ok) return shape;
	return classifyNormalizedEmail(shape.email, options);
}

/**
 * Classify an already-normalized address against the reject lists, skipping
 * the shape check (batch jobs over stored addresses).
 */
export function classifyNormalizedEmail(
	email: string,
	options: ValidateEmailOptions = {},
): ValidateEmailResult {
	const verdict = rejection(email, domainOf(email), options);
	return verdict ? { ok: false, verdict } : { ok: true, email };
}

// Placeholder first: it gets its own reason rather than a blocklist one.
function rejection(
	email: string,
	domain: string,
	options: ValidateEmailOptions,
): EmailVerdict | null {
	const placeholders = [...PLACEHOLDER_DOMAINS, ...(options.placeholderDomains ?? [])];
	if (isPlaceholderEmail(email, placeholders)) {
		return { reason: 'placeholder', message: 'This looks like a system placeholder address.' };
	}
	if (isBlockedTld(domain)) {
		return { reason: 'tld-blocked', message: 'Please use an email from a supported domain.' };
	}
	if (isBlockedDomain(domain)) return blockedDomain(email, domain, options);
	if (isDisposableEmail(email)) {
		return { reason: 'disposable', message: 'Please use a non-disposable email address.' };
	}
	return null;
}

function blockedDomain(email: string, domain: string, options: ValidateEmailOptions): EmailVerdict {
	const suggestion = suggestDomain(domain, options.candidates);
	if (!suggestion)
		return { reason: 'blocklist-other', message: 'Please use a valid email provider.' };
	const suggested = `${email.slice(0, email.indexOf('@'))}@${suggestion.domain}`;
	return {
		reason: 'blocklist-typo',
		message: `This looks like a typo — did you mean ${suggested}?`,
		suggestion: suggested,
	};
}
