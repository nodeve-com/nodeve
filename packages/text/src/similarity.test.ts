import { describe, expect, it } from 'vitest';
import { identifierSimilarity, identifierSimilarityMatch, tokenizeIdentifier } from './similarity.js';

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

	it('matches a local helper named for a different library via an alias', () => {
		// remeda exports `capitalize`; lodash names the same op `upperFirst`. A local
		// `upperFirst` reinvents it, so with the alias it scores identical.
		expect(identifierSimilarity('upperFirst', 'capitalize', { aliases: ['upperFirst'] })).toBe(1);
		expect(identifierSimilarity('lowerFirst', 'uncapitalize', { aliases: ['lowerFirst'] })).toBe(1);
	});

	it('returns the alias spelling that produced the best match', () => {
		expect(identifierSimilarityMatch('upperFirst', 'capitalize', { aliases: ['upperFirst'] })).toEqual({
			score: 1,
			matchedAs: 'upperFirst',
		});
	});

	it('keeps the direct score when no alias beats it', () => {
		// An unrelated alias must not drag an honest non-match upward.
		expect(identifierSimilarity('chunk', 'capitalize', { aliases: ['upperFirst'] })).toBe(0);
	});

	it('matches identifiers with an added keyword', () => {
		expect(identifierSimilarity('formatDate', 'format', { keywords: ['date'] })).toBe(1);
		expect(identifierSimilarity('formatDateDistance', 'formatDistance', { keywords: ['date'] })).toBe(1);
	});

	it('returns the keyword spelling that produced the best match', () => {
		expect(identifierSimilarityMatch('formatDateDistance', 'formatDistance', { keywords: ['date'] })).toEqual({
			score: 1,
			matchedAs: 'formatDistanceDate',
		});
	});

	it('returns 0 for unrelated names', () => {
		expect(identifierSimilarity('sendEmail', 'chunk')).toBe(0);
	});
});
