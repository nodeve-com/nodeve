/**
 * Explicit `typo → canonical` overrides for the runtime email-domain
 * suggester. Use sparingly — only for cases where Damerau-Levenshtein
 * against the canonical-providers list won't reach the right answer:
 *
 *   - the typo is equidistant from multiple canonicals
 *   - the typo collides with a real ccTLD (e.g. `gmail.co` is the
 *     Colombian Gmail TLD, not necessarily a typo of `gmail.com`)
 *   - the typo inserts a separator (`g.mail.com`, `t.online.de`) which
 *     inflates step count past the suggester's threshold
 *   - the canonical isn't in the high-volume "suggest toward" subset
 *     (e.g. `kpnmail.nl` regional providers)
 *
 * For domains the algorithm handles fine on its own (`gmial → gmail`,
 * `yhaoo → yahoo`), don't add an override — let the algorithm do its
 * job.
 */
export const TYPO_CORRECTIONS: ReadonlyMap<string, string> = new Map([
	// Separator typos — algorithm under-counts these.
	['g-mail.com', 'gmail.com'],
	['g.mail.com', 'gmail.com'],
	['ggmail.com', 'gmail.com'],
	['tonline.de', 't-online.de'],

	// Real-ccTLD collisions — algorithm picks the wrong winner.
	['gmail.co', 'gmail.com'],
	['gmail.cm', 'gmail.com'],
	['gmail.om', 'gmail.com'],

	// .con / .cm typos that the algorithm rejects on margin — multiple
	// 1-step candidates exist (e.g. yahoo.con is 1 step from yahoo.com,
	// yahoo.cn, yahoo.cm) so the margin check fails. These mappings are
	// unambiguous at human-intent level.
	['yahoo.con', 'yahoo.com'],
	['yahoo.cm', 'yahoo.com'],
	['yaho.co', 'yahoo.com'],
	['live.con', 'live.com'],
	['live.cm', 'live.com'],
	['hotmail.cm', 'hotmail.com'],
	['outlook.cm', 'outlook.com'],
	['aol.co', 'aol.com'],
	['aol.cm', 'aol.com'],
	['web.de.de', 'web.de'],

	// Wrong-first-letter typos where multiple candidates are 1 step away.
	// `hmail.com` → algorithm sees gmail.com / mail.com / ymail.com tied;
	// gmail is by far the most common intended target.
	['hmail.com', 'gmail.com'],
	['gemail.com', 'gmail.com'],

	// Regional canonicals not in the suggest-toward subset.
	['kpnmail.ml', 'kpnmail.nl'],
	['hotmail.ml', 'hotmail.nl'],
]);

export function correctTypo(domain: string): string | undefined {
	return TYPO_CORRECTIONS.get(domain.toLowerCase());
}
