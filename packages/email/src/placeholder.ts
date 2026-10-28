/**
 * Placeholder addresses: system-inserted markers for a missing or forgotten
 * address, not real mailboxes — e.g. Mailchimp's `forgotten.mailchimp.com`
 * for anonymized contacts. Distinct from the blocklist: "this is a marker",
 * not "we refuse this provider". Apps with their own placeholder domain pass
 * it via `validateEmailAddress`'s `placeholderDomains`.
 */
export const PLACEHOLDER_DOMAINS: readonly string[] = [
	'removed.invalid',
	'forgotten.mailchimp.com',
];

export function isPlaceholderEmail(
	address: string,
	domains: readonly string[] = PLACEHOLDER_DOMAINS,
): boolean {
	const lower = address.toLowerCase();
	return domains.some((d) => lower.endsWith(`@${d}`));
}
