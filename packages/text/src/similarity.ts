/**
 * Fuzzy match between two code identifiers by their *token sets*, not their raw
 * character sequence. `byGroup` and `groupBy` are a token transposition: as
 * strings they're far apart (edit-distance / Bitap miss them), but as token
 * multisets they're identical. Used to flag a local helper that reinvents a
 * dependency's export — e.g. local `clamp255` ≈ remeda `clamp`.
 */
import { capitalize } from 'remeda';
import { damerauLevenshtein } from './damerau-levenshtein.js';

// Folded so a local using a common shorthand still matches the lib's full word.
const EXPANSION_BY_ABBREVIATION: Record<string, string> = {
	uniq: 'unique',
	obj: 'object',
	arr: 'array',
	str: 'string',
	num: 'number',
	idx: 'index',
	fn: 'function',
};

/**
 * Lowercase a token and fold trivial plural/verb suffixes + known abbreviations,
 * so `chunked`/`chunk` and `uniq`/`unique` collapse to one word. Deliberately
 * crude (not a real stemmer) — applied symmetrically to both sides, so a slight
 * over-stem can't create a one-sided false match.
 */
function stemToken(token: string): string {
	const expanded = EXPANSION_BY_ABBREVIATION[token] ?? token;
	return expanded.replace(/ies$/, 'y').replace(/(ed|ing|s)$/, '');
}

/** Split a camelCase / snake_case / kebab-case / digit-bearing identifier into stemmed word tokens. */
export function tokenizeIdentifier(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_\-0-9]+/g, ' ')
		.toLowerCase()
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(stemToken);
}

// Two tokens count as the same word above this Damerau-Levenshtein similarity —
// absorbs a single typo (`recieve`/`receive`) without merging distinct words.
const NEAR_TOKEN_SIMILARITY = 0.85;

// Conversion affixes that carry no domain meaning, so they shouldn't dilute the
// score: a local `titleCase` reinvents remeda `toTitleCase` (and `camelCase` etc.
// reinvent `toCamelCase`). Dropped symmetrically before comparison — but only when
// that leaves a token on each side, so an identifier that is *only* the affix
// (`to`) still compares. (`is`/`as` would belong here too, but the stemmer's
// trailing-`s` rule rewrites them to `i`/`a` first, so they never reach this set.)
const AFFIX_STOPWORDS = new Set(['to']);

function withoutAffixes(tokens: string[]): string[] {
	const stripped = tokens.filter((t) => !AFFIX_STOPWORDS.has(t));
	return stripped.length ? stripped : tokens;
}

export type IdentifierSimilarityOptions = {
	/**
	 * Domain words to also compare as if they were prepended/appended to `b`.
	 * Useful for library exports whose domain is implied by the package name:
	 * `formatDate` can match `format` with keyword `date`.
	 */
	keywords?: string[];
	/**
	 * Alternate complete spellings of `b` to also compare against `a`, keeping the
	 * best score. Unlike `keywords` (affixes folded into `b`), each alias is a
	 * whole substitute name — for a library export another library names
	 * differently, so a local helper using the *other* library's vocabulary still
	 * matches. remeda's `capitalize` is lodash's `upperFirst`: pass
	 * `aliases: ['upperFirst']` and a local `upperFirst` scores against it.
	 */
	aliases?: string[];
};

export type IdentifierSimilarityMatch = {
	/** Best 0..1 similarity score. */
	score: number;
	/** Candidate spelling that produced the best score, including keyword if used. */
	matchedAs: string;
};

function identifierSimilarityBase(a: string, b: string): number {
	const at = withoutAffixes(tokenizeIdentifier(a));
	const bt = withoutAffixes(tokenizeIdentifier(b));
	if (at.length === 0 || bt.length === 0) return 0;

	const NUL = ' ';
	if ([...at].sort().join(NUL) === [...bt].sort().join(NUL)) return 1;

	const remaining = [...bt];
	let shared = 0;
	for (const ta of at) {
		const i = remaining.findIndex(
			(tb) => tb === ta || damerauLevenshtein(ta, tb).similarity >= NEAR_TOKEN_SIMILARITY,
		);
		if (i !== -1) {
			shared++;
			remaining.splice(i, 1);
		}
	}
	return shared / (at.length + bt.length - shared);
}

/**
 * 0..1 similarity of two identifiers by token set. Returns 1 when their stemmed
 * token *multisets* are equal regardless of order (the `groupBy`/`byGroup` /
 * `clamp255`-vs-`clamp` case); otherwise a fuzzy Jaccard where near-identical
 * tokens still count as shared. Domain tokens dilute the score, so a
 * domain-specific name (`groupSpotsByZone`) naturally falls below any useful
 * threshold against a generic lib export (`groupBy`).
 *
 * Pass `keywords` when the second identifier has an implied domain word. With
 * keyword `date`, `formatDate` matches `format` and `formatDateDistance`
 * matches `formatDistance`.
 */
export function identifierSimilarity(
	a: string,
	b: string,
	options: IdentifierSimilarityOptions = {},
): number {
	return identifierSimilarityMatch(a, b, options).score;
}

/**
 * Like `identifierSimilarity`, but also returns which keyword-expanded or
 * aliased spelling produced the best score.
 */
export function identifierSimilarityMatch(
	a: string,
	b: string,
	options: IdentifierSimilarityOptions = {},
): IdentifierSimilarityMatch {
	let best: IdentifierSimilarityMatch = { score: identifierSimilarityBase(a, b), matchedAs: b };

	for (const alias of options.aliases ?? []) {
		const score = identifierSimilarityBase(a, alias);
		if (score > best.score) best = { score, matchedAs: alias };
	}

	for (const keyword of options.keywords ?? []) {
		for (const matchedAs of [`${b}${capitalize(keyword)}`, `${keyword}${capitalize(b)}`]) {
			const score = identifierSimilarityBase(a, matchedAs);
			if (score > best.score) best = { score, matchedAs };
		}
	}
	return best;
}
