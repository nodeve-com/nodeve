// THE parse edge: snake_case data (authored YAML / baked JSON) → camelCase rename BEFORE validation
// → `Value.Check` against the concept's camelCase TypeBox schema. The rename is mapping-driven off
// the schema's stamped `x-key-map` (@nodeve/schema-case) — only declared props move; slugs, locale
// tags, and record keys are untouched — and errors map back to the snake source path.

import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { camelizeInstance, snakePath } from '@nodeve/schema-case';

/** Rename snake→camel (on a clone — caller's input untouched), materialize schema `default`s
 *  (re-renamed, so an object default authored snake lands camel too), then validate. Throws an
 *  aggregated error, each path pointing at the snake source. */
export function parseSnake<T>(schema: TSchema, data: unknown, label: string): T {
	const filled = camelizeInstance(schema, Value.Default(schema, camelizeInstance(schema, Value.Clone(data))));
	if (Value.Check(schema, filled)) return filled as T;
	const errors = [...Value.Errors(schema, filled)].map((e) => `  ${snakePath(schema, e.path) || '/'}: ${e.message}`).join('\n');
	throw new Error(`Invalid ${label}:\n${errors}`);
}
