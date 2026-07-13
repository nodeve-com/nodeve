// snake_case draft-07 JSON Schema → its camelCase sibling. THE one place the draft-07 grammar
// lives: which positions hold property NAMES (`properties` keys, `required` members, `dependencies`)
// versus values and annotations (`enum`, `const`, `default`, `pattern`, `title` — untouched, always).
// Every object node whose keys rename is stamped with `x-key-map` (snake→camel, differing keys
// only) — the stored alias instance renames and reverse path lookups read (instance.ts), so no
// consumer ever re-derives casing by string transformation.

import { isPlainObject, toCamelCase } from 'remeda';

/** The stored-alias keyword stamped on renamed object nodes: `{ snake_key: 'camelKey', … }`. */
export const KEY_MAP = 'x-key-map';

type Obj = Record<string, unknown>;


// Positions holding one subschema, a list of subschemas, or a name-keyed / free-keyed map of them.
const one = (v: unknown): unknown => camelizeSchema(v);
const listOrOne = (v: unknown): unknown => (Array.isArray(v) ? v.map(one) : one(v));
const camelizeValues = (v: unknown): unknown =>
	isPlainObject(v) ? Object.fromEntries(Object.entries(v).map(([k, s]) => [k, one(s)])) : v;

/**
 * A snake_case draft-07 schema as its camelCase sibling. Declared property names rename —
 * `properties` keys (recorded in the node's `x-key-map`), `required` members, `dependencies` keys
 * and name-list values — and every subschema position recurses. Everything else (values,
 * annotations, `enum`/`const`/`default`, `patternProperties`/`$defs`/`definitions` KEYS, `$ref`
 * targets, data-bearing map keys) passes through verbatim.
 */
export function camelizeSchema(schema: unknown): unknown {
	if (!isPlainObject(schema)) return schema; // boolean schemas (`false` forbids), non-schema leaves
	const out: Obj = { ...schema };

	if (out.properties !== undefined && isPlainObject(out.properties)) {
		const keyMap: Record<string, string> = {};
		out.properties = Object.fromEntries(
			Object.entries(out.properties).map(([name, s]) => {
				const camel = toCamelCase(name);
				if (camel !== name) keyMap[name] = camel;
				return [camel, one(s)];
			}),
		);
		if (Object.keys(keyMap).length > 0) out[KEY_MAP] = keyMap;
	}
	if (Array.isArray(out.required)) out.required = out.required.map((m) => (typeof m === 'string' ? toCamelCase(m) : m));
	if (out.dependencies !== undefined && isPlainObject(out.dependencies))
		out.dependencies = Object.fromEntries(
			Object.entries(out.dependencies).map(([name, dep]) => [
				toCamelCase(name),
				Array.isArray(dep) ? dep.map((m) => (typeof m === 'string' ? toCamelCase(m) : m)) : one(dep),
			]),
		);

	if (out.items !== undefined) out.items = listOrOne(out.items);
	if (out.additionalItems !== undefined) out.additionalItems = one(out.additionalItems);
	if (out.additionalProperties !== undefined) out.additionalProperties = one(out.additionalProperties);
	if (out.contains !== undefined) out.contains = one(out.contains);
	if (out.propertyNames !== undefined) out.propertyNames = one(out.propertyNames);
	if (out.not !== undefined) out.not = one(out.not);
	if (out.if !== undefined) out.if = one(out.if);
	if (out.then !== undefined) out.then = one(out.then);
	if (out.else !== undefined) out.else = one(out.else);
	if (Array.isArray(out.allOf)) out.allOf = out.allOf.map(one);
	if (Array.isArray(out.anyOf)) out.anyOf = out.anyOf.map(one);
	if (Array.isArray(out.oneOf)) out.oneOf = out.oneOf.map(one);
	if (out.patternProperties !== undefined) out.patternProperties = camelizeValues(out.patternProperties);
	if (out.definitions !== undefined) out.definitions = camelizeValues(out.definitions);
	if (out.$defs !== undefined) out.$defs = camelizeValues(out.$defs);

	return out;
}
