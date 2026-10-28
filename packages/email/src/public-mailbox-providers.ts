import providers from './public-mailbox-providers.json' with { type: 'json' };

/**
 * Apexes of multi-tenant public mailbox providers — domains where the apex
 * hosts mailboxes for unrelated individuals rather than a single organization
 * (Gmail, Outlook consumer, Yahoo, AOL, iCloud, Proton, GMX, Mail.com, large
 * ISP mailboxes, regional providers in CN/RU/EU/JP, etc.).
 *
 * Used by the email pipeline to distinguish "apex reputation transfers to
 * sender" (corporate / dedicated apex — DHL, Stripe, GitHub) from "apex
 * reputation is the *provider's*, not this sender's" (gmail.com is a great
 * apex; the spammer who signed up for it is not). Without this signal,
 * fully-authenticated mail from a public-mailbox apex fires reputation
 * composites (`sender-reputable`, `sender-trusted`) and skips/narrows the
 * bounce gate — which is how an obvious-spam Gmail account once slipped
 * through and caused Google to bounce our forwarded copies.
 *
 * NOT included on purpose:
 *
 * - Corporate apexes that happen to use Google Workspace / Microsoft 365.
 *   The apex still belongs to one organization and apex reputation IS
 *   sender reputation. Workspace mail signs as the tenant's apex, not as
 *   gmail.com / outlook.com, so DKIM alignment naturally separates them.
 * - `google.com`, `microsoft.com`, `apple.com`, `proton.com` (the provider
 *   companies' own corporate domains). Their outbound mail is corporate,
 *   not consumer.
 * - Apple's iCloud private-relay (`*.icloud.com` HIDE-MY-EMAIL aliases).
 *   Those are handled separately via `apple-relay.ts` — that's a
 *   forwarding alias problem, not a multi-tenancy problem.
 *
 * Matching is exact-apex, lowercased. Sub-domains are not matched —
 * `users@mx.gmail.com` would slip through, but no legitimate Gmail mail
 * comes from a subdomain.
 *
 * Refresh is manual — providers add new locale variants occasionally but
 * the list is small and stable enough that PRs are the right shape. Major
 * sources: each provider's documented sending domains and SPF records.
 */
export const PUBLIC_MAILBOX_PROVIDERS: ReadonlySet<string> = new Set(providers);

export function isPublicMailboxProvider(apex: string): boolean {
	return PUBLIC_MAILBOX_PROVIDERS.has(apex.toLowerCase());
}
