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

function camelizeProperties(properties: Record<string, unknown>): {
	properties: Obj;
	keyMap: Record<string, string>;
} {
	const keyMap: Record<string, string> = {};
	const entries = Object.entries(properties).map(([name, schema]) => {
		const camel = toCamelCase(name);
		if (camel !== name) keyMap[name] = camel;
		return [camel, one(schema)];
	});
	return { properties: Object.fromEntries(entries), keyMap };
}

function camelizeDependencies(dependencies: Record<string, unknown>): Obj {
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, dependency]) => [
			toCamelCase(name),
			Array.isArray(dependency)
				? dependency.map((member) => (typeof member === 'string' ? toCamelCase(member) : member))
				: one(dependency),
		]),
	);
}

function camelizeSubschemas(out: Obj): void {
	for (const key of [
		'additionalItems',
		'additionalProperties',
		'contains',
		'propertyNames',
		'not',
		'if',
		'then',
		'else',
	])
		if (out[key] !== undefined) out[key] = one(out[key]);
	for (const key of ['allOf', 'anyOf', 'oneOf'])
		if (Array.isArray(out[key])) out[key] = out[key].map(one);
	for (const key of ['patternProperties', 'definitions', '$defs'])
		if (out[key] !== undefined) out[key] = camelizeValues(out[key]);
}

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
		const { properties, keyMap } = camelizeProperties(out.properties);
		out.properties = properties;
		if (Object.keys(keyMap).length > 0) out[KEY_MAP] = keyMap;
	}
	if (Array.isArray(out.required))
		out.required = out.required.map((m) => (typeof m === 'string' ? toCamelCase(m) : m));
	if (out.dependencies !== undefined && isPlainObject(out.dependencies))
		out.dependencies = camelizeDependencies(out.dependencies);

	if (out.items !== undefined) out.items = listOrOne(out.items);
	camelizeSubschemas(out);

	return out;
}
