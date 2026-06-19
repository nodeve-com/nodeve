# @nodeve/utils

Small, cross-runtime utilities shared across nodeve tooling. Works the same in
browsers, Node, and Bun.

## `@nodeve/utils/short-code`

Derive a stable, URL-safe 8-character short-code from any string or byte buffer.
The input is SHA-256 hashed and the leading 5 bytes (40 bits) are Crockford
base32 encoded — exactly 8 characters from a case-insensitive alphabet with no
ambiguous I/L/O/U. Same input, same code: it's a content address, not a random
id.

```ts
import { shortCode } from '@nodeve/utils/short-code';

shortCode('https://example.com/some/long/path'); // → e.g. 'A3K9F2QT'
shortCode(new Uint8Array([1, 2, 3])); // raw bytes work too
```
