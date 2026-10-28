/**
 * Canonical form for email addresses — trim surrounding whitespace, lowercase.
 *
 * Deliberately minimal. Don't add provider-specific rules (Gmail dot/plus
 * stripping) — they break addresses on providers where dots are significant
 * and turn this into a deliverability router. Don't add typo correction —
 * that's the domain suggester's job (suggest + user accepts), not a silent
 * rewrite. Unicode/IDN normalization is unnecessary because zod's `.email()`
 * rejects those shapes upstream.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Extract the domain part of an email address. Returns `''` if there's no
 * `@`. Does not normalize — pass a value through `normalizeEmail` first if
 * you need canonical lowercase form. Used by validation, verification,
 * and the typo suggester.
 */
export const domainOf = (email: string): string => email.split('@')[1] ?? '';
