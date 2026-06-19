import { describe, expect, it } from 'vitest';
import { formatSigned, isIsoDateString, titleCase } from './text-format.ts';

describe('titleCase', () => {
	it('splits camelCase, snake_case, and kebab-case into Title Case', () => {
		expect(titleCase('camelCase')).toBe('Camel Case');
		expect(titleCase('snake_case')).toBe('Snake Case');
		expect(titleCase('kebab-case')).toBe('Kebab Case');
		expect(titleCase('email_verified')).toBe('Email Verified');
		expect(titleCase('createdAt')).toBe('Created At');
	});

	it('does not preserve acronyms', () => {
		expect(titleCase('mongoOid')).toBe('Mongo Oid');
	});
});

describe('isIsoDateString', () => {
	it('matches ISO-8601 datetime strings (with T)', () => {
		expect(isIsoDateString('2025-04-15T12:34:56.000Z')).toBe(true);
		expect(isIsoDateString('2024-01-01T00:00:00Z')).toBe(true);
	});

	it('rejects date-only strings, non-date strings, and non-strings', () => {
		expect(isIsoDateString('2025-04-15')).toBe(false);
		expect(isIsoDateString('not a date')).toBe(false);
		expect(isIsoDateString(null)).toBe(false);
		expect(isIsoDateString(new Date())).toBe(false);
	});
});

describe('formatSigned', () => {
	it('prefixes a + for positive numbers', () => {
		expect(formatSigned(1.5)).toBe('+1.500');
	});

	it('keeps the native - for negative numbers', () => {
		expect(formatSigned(-1.5)).toBe('-1.500');
	});

	it('uses a leading space for zero so columns stay aligned', () => {
		expect(formatSigned(0)).toBe(' 0.000');
	});

	it('honors the digits argument', () => {
		expect(formatSigned(2, 1)).toBe('+2.0');
	});
});
