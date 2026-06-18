# @nodeve/text

Small, dependency-free text utilities shared across nodeve tooling.

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
