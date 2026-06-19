import { describe, expect, it } from 'vitest';
import { identifierSimilarity, tokenizeIdentifier } from './similarity.js';

describe('tokenizeIdentifier', () => {
	it('splits and stems across casing styles', () => {
		expect(tokenizeIdentifier('groupBy')).toEqual(['group', 'by']);
		expect(tokenizeIdentifier('to_title_case')).toEqual(['to', 'title', 'case']);
		expect(tokenizeIdentifier('clamp255')).toEqual(['clamp']);
		expect(tokenizeIdentifier('uniqBy')).toEqual(['unique', 'by']);
	});
});

describe('identifierSimilarity', () => {
	it('scores a token transposition as identical', () => {
		expect(identifierSimilarity('byGroup', 'groupBy')).toBe(1);
	});

	it('scores a stemmed/abbreviated specialization as identical', () => {
		expect(identifierSimilarity('clamp255', 'clamp')).toBe(1);
		expect(identifierSimilarity('chunked', 'chunk')).toBe(1);
		expect(identifierSimilarity('uniqueBy', 'uniqBy')).toBe(1);
	});

	it('ignores the `to` conversion affix so a coercion reinvention scores identical', () => {
		// `to` carries no domain meaning: local `titleCase` reinvents remeda `toTitleCase`.
		expect(identifierSimilarity('titleCase', 'toTitleCase')).toBe(1);
		expect(identifierSimilarity('camelCase', 'toCamelCase')).toBe(1);
	});

	it('lets domain tokens dilute a generic-lib collision', () => {
		// {group,spots,by,zone} vs {group,by} → 2/4 = 0.5, safely under threshold.
		expect(identifierSimilarity('groupSpotsByZone', 'groupBy')).toBe(0.5);
	});

	it('returns 0 for unrelated names', () => {
		expect(identifierSimilarity('sendEmail', 'chunk')).toBe(0);
	});
});
