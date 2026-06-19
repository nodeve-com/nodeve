import { isString } from 'remeda';

/** True for an ISO-8601 datetime string (yyyy-mm-ddT…). Cheap regex, no Date parse. */
export function isIsoDateString(value: unknown): value is string {
	return isString(value) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

/**
 * Formats a number with an explicit leading sign: `+` for positive, the native
 * `-` for negative (via toFixed), and a space for zero so columns stay aligned.
 */
export function formatSigned(n: number, digits = 3): string {
	const sign = n > 0 ? '+' : n < 0 ? '' : ' ';
	return `${sign}${n.toFixed(digits)}`;
}

/**
 * Converts an identifier (camelCase / snake_case / kebab-case) to Title Case
 * for display. Acronyms are not preserved — `mongoOid` becomes "Mongo Oid",
 * not "Mongo OID".
 */
export function titleCase(key: string): string {
	return key
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}
