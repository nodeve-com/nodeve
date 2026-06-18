/**
 * Fuzzy match between two code identifiers by their *token sets*, not their raw
 * character sequence. `byGroup` and `groupBy` are a token transposition: as
 * strings they're far apart (edit-distance / Bitap miss them), but as token
 * multisets they're identical. Used to flag a local helper that reinvents a
 * dependency's export — e.g. local `clamp255` ≈ remeda `clamp`.
 */
import { damerauLevenshtein } from './damerau-levenshtein.js';

// Folded so a local using a common shorthand still matches the lib's full word.
const ABBREVIATIONS: Record<string, string> = {
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
	const expanded = ABBREVIATIONS[token] ?? token;
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

/**
 * 0..1 similarity of two identifiers by token set. Returns 1 when their stemmed
 * token *multisets* are equal regardless of order (the `groupBy`/`byGroup` /
 * `clamp255`-vs-`clamp` case); otherwise a fuzzy Jaccard where near-identical
 * tokens still count as shared. Domain tokens dilute the score, so a
 * domain-specific name (`groupSpotsByZone`) naturally falls below any useful
 * threshold against a generic lib export (`groupBy`).
 */
export function identifierSimilarity(a: string, b: string): number {
	const at = tokenizeIdentifier(a);
	const bt = tokenizeIdentifier(b);
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
