# @nodeve/email

Email address quality and sending. Pure and client-safe except `zeptomail`: the same verdict in the browser and on the server.

## `@nodeve/email/validate-email`

`validateEmailAddress(raw, options?)`: shape check, normalize, then placeholder, blocked TLD, typo-squat, disposable. Returns `{ ok: true, email }` or `{ ok: false, verdict: { reason, message, suggestion? } }`; `reason` is one of `EMAIL_INVALID_REASONS`.

```ts
import { validateEmailAddress } from '@nodeve/email/validate-email';

validateEmailAddress('Alice@Example.com'); // → { ok: true, email: 'alice@example.com' }
validateEmailAddress('alice@aol.cmo'); // → reason 'blocklist-typo', suggestion 'alice@aol.com'
validateEmailAddress('u@forgotten.app.com', { placeholderDomains: ['forgotten.app.com'] }); // → reason 'placeholder'
```

- `parseEmailShape(raw)`: shape and normalize only, for storing observed addresses.
- `classifyNormalizedEmail(email, options?)`: the reject lists only, for stored addresses.
- `options.candidates`: typo-suggestion pool, see `suggest-domain`.

## `@nodeve/email/suggest-domain`

`suggestDomain(domain, candidates?)`: the intended domain, or `null`. `TYPO_CORRECTIONS` overrides first, then Damerau-Levenshtein against `candidates` (default `PUBLIC_MAILBOX_PROVIDERS`). A candidate must reach `SUGGEST_SIMILARITY_THRESHOLD` and beat the runner-up by `SUGGEST_MARGIN_STEPS` edits. Pass your users' own domains as `candidates` to suggest corporate domains too.

## Lists

| Module | Exports | Source |
| - | - | - |
| `blocklist` | `BLOCKED_DOMAINS`, `BLOCKED_TLDS`, `isBlockedDomain`, `isBlockedTld` | `blocklist.json`, by hand |
| `disposable` | `DISPOSABLE_EMAIL_DOMAINS`, `isDisposableEmail` | [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains), `pnpm --filter @nodeve/email update:disposable` |
| `public-mailbox-providers` | `PUBLIC_MAILBOX_PROVIDERS`, `isPublicMailboxProvider` | `public-mailbox-providers.json`, by hand |
| `typo-corrections` | `TYPO_CORRECTIONS`, `correctTypo` | by hand |
| `placeholder` | `PLACEHOLDER_DOMAINS`, `isPlaceholderEmail` | by hand |
| `apple-relay` | `APPLE_RELAY_DOMAIN`, `isAppleRelayEmail` | Apple Hide My Email: skip remote verification |

## `@nodeve/email/normalize`, `@nodeve/email/format`

`normalizeEmail` (trim, lowercase), `domainOf`, `formatMailbox(name, address)` → `"Name" <address>`.

## `@nodeve/email/zeptomail`

`sendMail({ token, from, to, subject, htmlbody?, textbody?, replyTo? })`: one ZeptoMail send over `fetch`, so it runs on Workers. Throws with ZeptoMail's status and body on failure. Server-only: the token is a secret.
