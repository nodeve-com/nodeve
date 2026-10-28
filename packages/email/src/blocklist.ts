import blocklist from './blocklist.json' with { type: 'json' };

/**
 * Typo-squats and lookalikes of real providers: they resolve and accept mail
 * but aren't legitimate. Source of truth is `blocklist.json` — lowercase,
 * sorted. Explicit `typo → canonical` overrides for the suggester live in
 * `typo-corrections.ts`.
 */
export const BLOCKED_DOMAINS: ReadonlySet<string> = new Set(blocklist);

// TLDs we refuse outright. Rationale per group:
//   - Sanctions / high-fraud: .ru, .by, .kp, .ir, .su
//   - Free-registration spam farms: .tk, .ml, .ga, .cf, .gq (Freenom)
//   - Bulk-typo abuse: .top, .xyz, .click, .link, .work (cheap, frequently
//     used for typo-squats and throwaway accounts)
// Edit this list directly when you find new abuse patterns.
export const BLOCKED_TLDS: ReadonlySet<string> = new Set([
	'ru',
	'by',
	'kp',
	'ir',
	'su',
	'tk',
	'ml',
	'ga',
	'cf',
	'gq',
	'top',
	'xyz',
	'click',
	'link',
	'work',
]);

export function isBlockedDomain(domain: string): boolean {
	return BLOCKED_DOMAINS.has(domain.toLowerCase());
}

export function isBlockedTld(domain: string): boolean {
	const d = domain.toLowerCase();
	const dot = d.lastIndexOf('.');
	const tld = dot === -1 ? d : d.slice(dot + 1);
	return BLOCKED_TLDS.has(tld);
}
