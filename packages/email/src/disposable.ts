import disposableList from './disposable.json' with { type: 'json' };

/**
 * Disposable / throwaway email domains to reject at form-submit time.
 *
 * Sourced from the canonical `disposable-email-domains` list:
 * https://github.com/disposable-email-domains/disposable-email-domains
 *
 * Refresh with: `pnpm --filter @nodeve/email update:disposable`.
 *
 * Ships to both client and server (~29KB gzipped). The client check
 * blocks a disposable address before it leaves the form; the server
 * repeats it because clients are untrusted. Same list, one source of
 * truth, so the two can't drift.
 *
 * Matching is exact on the part after the last `@`, lowercased.
 * Sub-domains are NOT matched — if `example.com` is blocked but a
 * user signs up with `foo@sub.example.com`, the sub-domain slips
 * through. The upstream list is maintained with that in mind.
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set(disposableList);

export function isDisposableEmail(email: string): boolean {
	const at = email.lastIndexOf('@');
	if (at === -1) return false;
	const domain = email.slice(at + 1).toLowerCase();
	return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
