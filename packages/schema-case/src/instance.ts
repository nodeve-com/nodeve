// Instance-side companions to camelize-schema.ts: rename a snake_case instance to the camelCase
// shape its (camelized) schema declares, and point a camel path back at its snake source. Both are
// mapping-driven off the stamped `x-key-map` — never string transformation — so only DECLARED
// property names move; data-bearing keys (slugs, locale tags, record keys) are untouched.

import { isPlainObject } from 'remeda';
import { KEY_MAP } from './camelize-schema.ts';

type Obj = Record<string, unknown>;

/** The snake→camel map a camelized object schema node carries ({} when no key differs). */
const keyMapOf = (schema: Obj): Record<string, string> => (schema[KEY_MAP] as Record<string, string>) ?? {};

/** camel key → the snake spelling it renamed from, for one object schema node ({} when none). */
export const snakeKeyByCamel = (schema: unknown): Record<string, string> =>
	Object.fromEntries(Object.entries(isPlainObject(schema) ? keyMapOf(schema) : {}).map(([snake, camel]) => [camel, snake]));

/**
 * Rename a snake_case instance's declared keys to their camel spelling, driven by the schema's
 * stamped `x-key-map`. Undeclared keys pass through untouched (validation then rejects them under
 * their original name); values recurse through `properties`, `items`, `additionalProperties`, and
 * `anyOf`/`allOf` branches.
 */
export function camelizeInstance(schema: unknown, data: unknown): unknown {
	if (!isPlainObject(schema)) return data;
	// Combinator branches AND the node's own declarations both apply — a node may carry both
	// (properties beside an allOf cross-field rule); neither shadows the other.
	if (Array.isArray(schema.anyOf)) data = (schema.anyOf as unknown[]).reduce((d, s) => camelizeInstance(s, d), data);
	if (Array.isArray(schema.allOf)) data = (schema.allOf as unknown[]).reduce((d, s) => camelizeInstance(s, d), data);
	if (Array.isArray(data)) return isPlainObject(schema.items) ? data.map((d) => camelizeInstance(schema.items, d)) : data;
	if (!isPlainObject(data)) return data;
	const props = schema.properties;
	if (isPlainObject(props)) {
		const map = keyMapOf(schema);
		return Object.fromEntries(
			Object.entries(data).map(([k, v]) => {
				const camel = map[k] ?? k;
				return [camel, camelizeInstance(props[camel], v)];
			}),
		);
	}
	if (isPlainObject(schema.additionalProperties))
		return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, camelizeInstance(schema.additionalProperties, v)]));
	return data;
}

// One path segment back to snake: descend the schema alongside the path, inverting the node's map.
const step = (schema: unknown, seg: string): { snake: string; next: unknown } => {
	if (!isPlainObject(schema)) return { snake: seg, next: undefined };
	// Own declarations first; combinator branches (which may coexist on the node) as fallback.
	if (/^\d+$/.test(seg) && schema.items !== undefined) return { snake: seg, next: schema.items };
	if (isPlainObject(schema.properties) && seg in schema.properties)
		return { snake: snakeKeyByCamel(schema)[seg] ?? seg, next: schema.properties[seg] };
	for (const branch of [...(Array.isArray(schema.anyOf) ? schema.anyOf : []), ...(Array.isArray(schema.allOf) ? schema.allOf : [])]) {
		const r = step(branch, seg);
		if (r.next !== undefined || r.snake !== seg) return r;
	}
	if (isPlainObject(schema.additionalProperties)) return { snake: seg, next: schema.additionalProperties };
	return { snake: seg, next: undefined };
};

/** A camel instance path (`/ingest/ingestKind`, JSON-pointer style) back to its snake source path,
 *  best-effort — unmapped segments pass through. */
export function snakePath(schema: unknown, camelPath: string): string {
	let node: unknown = schema;
	const out: string[] = [];
	for (const seg of camelPath.split('/').slice(1)) {
		const r = step(node, seg);
		out.push(r.snake);
		node = r.next;
	}
	return out.length > 0 ? `/${out.join('/')}` : camelPath;
}
