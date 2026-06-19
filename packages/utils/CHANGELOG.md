# @nodeve/utils

## 0.1.0

### Minor Changes

- Initial release. `@nodeve/utils/short-code` derives a stable, URL-safe 8-character Crockford base32 short-code from any string or byte buffer (SHA-256 of the input, leading 5 bytes encoded). Same input always yields the same code, and it runs identically in browsers, Node, and Bun.
