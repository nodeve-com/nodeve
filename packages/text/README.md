# @nodeve/text

Small text utilities shared across nodeve tooling.

## `@nodeve/text/similarity`

Fuzzy identifier matching by token set rather than character sequence — so
`byGroup` and `groupBy` (a token transposition) score as identical, while
edit-distance would miss them.

```ts
import { identifierSimilarity, tokenizeIdentifier } from '@nodeve/text/similarity';

identifierSimilarity('clamp255', 'clamp'); // → 1
tokenizeIdentifier('groupSpotsByZone'); // → ['group', 'spot', 'by', 'zone']
```

## `@nodeve/text/damerau-levenshtein`

The unrestricted Damerau-Levenshtein edit distance the similarity scorer builds
on, exported on its own for direct use (e.g. typo-tolerant suggestion matching).

```ts
import { damerauLevenshtein } from '@nodeve/text/damerau-levenshtein';

damerauLevenshtein('gmial.com', 'gmail.com'); // → { steps: 1, relative, similarity }
```

## `@nodeve/text/trim`

Boundary-aware trimming: collapse whitespace and cut to a length budget,
preferring a sentence boundary and falling back to a word boundary.

```ts
import { trimText } from '@nodeve/text/trim';

trimText(longDocstring, { max: 120, ellipsis: '...' });
```

## `@nodeve/text/slugify`

URL-safe slugs with charmap transliteration (accents, currency, cyrillic, …),
plus a `uniqueSlug` helper that dedupes against a `seen` set with a
caller-supplied deterministic suffix.

```ts
import { slugify, uniqueSlug } from '@nodeve/text/slugify';

slugify('café Latte'); // → 'cafe-latte'
uniqueSlug('Hello World', 'abc123', seen); // → 'hello-world' (then 'hello-world-abc123' on collision)
```

## `@nodeve/text/wrap-text`

Greedy word-wrap to a character budget. Collapses whitespace, never splits a
word mid-character (long words overflow their own line).

```ts
import { wrapText } from '@nodeve/text/wrap-text';

wrapText('Kitchen Sockets', 8); // → ['Kitchen', 'Sockets']
```

## `@nodeve/text/lone-surrogates`

Replace unpaired UTF-16 surrogates with U+FFFD so values are valid Unicode and
safe for a Postgres `jsonb` boundary. `replaceLoneSurrogatesDeep` walks arrays
and plain objects.

```ts
import { replaceLoneSurrogates, replaceLoneSurrogatesDeep } from '@nodeve/text/lone-surrogates';

replaceLoneSurrogates('cut\uD83D&rest'); // → 'cut�&rest'
```

## `@nodeve/text/text-format`

Number and date display helpers: `formatSigned` (explicit leading sign,
zero-aligned) and the `isIsoDateString` guard. For Title Case use remeda's
`toTitleCase` (`createdAt` → `Created At`).

```ts
import { formatSigned, isIsoDateString } from '@nodeve/text/text-format';

formatSigned(1.5); // → '+1.500'
isIsoDateString('2026-06-19T00:00:00Z'); // → true
```
