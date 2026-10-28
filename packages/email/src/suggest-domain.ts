import { damerauLevenshtein } from '@nodeve/text/damerau-levenshtein';
import { PUBLIC_MAILBOX_PROVIDERS } from './public-mailbox-providers.js';
import { TYPO_CORRECTIONS } from './typo-corrections.js';

export type DomainSuggestion = {
	domain: string;
	similarity: number;
	source: 'override' | 'candidate';
};

/**
 * Minimum `relative` similarity for a candidate to count as a plausible typo.
 * Tuned down from 1.0 to accept single-char edits on short domains
 * (`aol.com` → `aol.con` is 1 step on 7 chars = 0.857). Raise it and real
 * typos start slipping through; lower it and unrelated short domains start
 * matching each other.
 */
export const SUGGEST_SIMILARITY_THRESHOLD = 0.75;

/**
 * The best candidate must beat the runner-up by at least this many edits for
 * the suggestion to be confident. One edit of separation rejects the
 * genuine equidistant case (e.g. `yahoo.ac` is 1 edit from both `yahoo.at`
 * and `yahoo.ca`) while still accepting realistic typos of high-volume
 * providers, where the runner-up is 2+ edits further away. When the
 * algorithm still can't resolve an ambiguous case, `typo-corrections.ts`
 * exists for explicit overrides.
 */
export const SUGGEST_MARGIN_STEPS = 1;

type Scored = { domain: string; steps: number; similarity: number };

/**
 * `candidates` is the pool typos are matched against — not an allowlist.
 * Defaults to the public mailbox providers; pass a larger pool (e.g. domains
 * your own users send from) to suggest corporate domains too.
 */
export function suggestDomain(
	input: string,
	candidates: Iterable<string> = PUBLIC_MAILBOX_PROVIDERS,
): DomainSuggestion | null {
	const normalized = input.trim().toLowerCase();
	if (!normalized) return null;
	const override = TYPO_CORRECTIONS.get(normalized);
	if (override) return { domain: override, similarity: 1, source: 'override' };
	const [best, runnerUp] = rankCandidates(normalized, candidates);
	if (!best || best.domain === normalized) return null;
	if (best.similarity < SUGGEST_SIMILARITY_THRESHOLD) return null;
	if (runnerUp && runnerUp.steps - best.steps < SUGGEST_MARGIN_STEPS) return null;
	return { domain: best.domain, similarity: best.similarity, source: 'candidate' };
}

function rankCandidates(input: string, pool: Iterable<string>): [Scored?, Scored?] {
	let best: Scored | undefined;
	let runnerUp: Scored | undefined;
	for (const domain of pool) {
		const { steps, similarity } = damerauLevenshtein(input, domain);
		const scored: Scored = { domain, steps, similarity };
		if (!best || steps < best.steps) {
			runnerUp = best;
			best = scored;
		} else if (!runnerUp || steps < runnerUp.steps) {
			runnerUp = scored;
		}
	}
	return [best, runnerUp];
}
