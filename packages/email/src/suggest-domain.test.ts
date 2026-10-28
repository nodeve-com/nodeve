import { describe, expect, it } from 'vitest';
import { suggestDomain } from './suggest-domain.js';

describe('suggestDomain', () => {
	describe('override hits', () => {
		it('returns TYPO_CORRECTIONS entry verbatim', () => {
			expect(suggestDomain('gmail.co')).toEqual({
				domain: 'gmail.com',
				similarity: 1,
				source: 'override',
			});
		});

		it('is case-insensitive for overrides', () => {
			expect(suggestDomain('G.Mail.Com')).toMatchObject({
				domain: 'gmail.com',
				source: 'override',
			});
		});

		it('trims whitespace before lookup', () => {
			expect(suggestDomain('  gmail.co  ')).toMatchObject({
				domain: 'gmail.com',
				source: 'override',
			});
		});
	});

	describe('candidate hits', () => {
		it('corrects gmial.com to gmail.com', () => {
			expect(suggestDomain('gmial.com')).toMatchObject({
				domain: 'gmail.com',
				source: 'candidate',
			});
		});

		it('corrects yhaoo.com to yahoo.com', () => {
			expect(suggestDomain('yhaoo.com')).toMatchObject({
				domain: 'yahoo.com',
				source: 'candidate',
			});
		});

		it('corrects outloook.com to outlook.com', () => {
			expect(suggestDomain('outloook.com')).toMatchObject({
				domain: 'outlook.com',
				source: 'candidate',
			});
		});
	});

	describe('ambiguous inputs', () => {
		it('returns null for yahoo.ac (equidistant from yahoo.at and yahoo.ca)', () => {
			expect(suggestDomain('yahoo.ac', ['yahoo.at', 'yahoo.ca'])).toBeNull();
		});
	});

	describe('no suggestion', () => {
		it('returns null when input equals a candidate', () => {
			expect(suggestDomain('gmail.com')).toBeNull();
		});

		it('returns null for empty input', () => {
			expect(suggestDomain('')).toBeNull();
		});

		it('returns null for whitespace-only input', () => {
			expect(suggestDomain('   ')).toBeNull();
		});

		it('returns null for garbage input far from everything', () => {
			expect(suggestDomain('xqzkrmvbntdlw.example')).toBeNull();
		});
	});
});

describe('suggestDomain candidates', () => {
	it('suggests from a caller-supplied pool', () => {
		expect(suggestDomain('exmaple-corp.com', ['example-corp.com'])).toMatchObject({
			domain: 'example-corp.com',
			source: 'candidate',
		});
		expect(suggestDomain('exmaple-corp.com')).toBeNull();
	});
});
