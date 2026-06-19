import { sha256 } from '@noble/hashes/sha2.js';
import { base32crockford } from '@scure/base';

/** Number of leading hash bytes to encode. 5 bytes = 40 bits = exactly 8
 * Crockford base32 chars, with no padding to trim. */
const CODE_BYTES = 5;

/** Length of the produced short-code, derived from {@link CODE_BYTES}. */
export const SHORT_CODE_LENGTH = 8;

/**
 * Derive a stable, URL-safe 8-character short-code from arbitrary input.
 *
 * The input is hashed with SHA-256 and the leading 5 bytes are encoded with
 * Crockford base32 — a 40-bit window that lands on exactly 8 characters from
 * an unambiguous, case-insensitive alphabet (no I/L/O/U). The same input
 * always yields the same code, so it's a content address, not a random id.
 *
 * Works the same in browsers, Node, and Bun: strings are encoded as UTF-8 via
 * the standard `TextEncoder`, and both dependencies are pure-JS and runtime
 * agnostic.
 *
 * @param input  A string (hashed as UTF-8) or raw bytes.
 * @returns An 8-character Crockford base32 string (uppercase A-Z/0-9, no
 *          I/L/O/U).
 */
export function shortCode(input: string | Uint8Array): string {
	const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
	const digest = sha256(bytes);
	return base32crockford.encode(digest.subarray(0, CODE_BYTES));
}
