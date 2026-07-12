// Shared validate-then-camelCase step used by every concept's `parse*` export.
// A concept's schema is snake_case (it BE-s the JSON Schema and validates the snake YAML);
// the TS surface is camelCase. So each parser validates against the snake schema, then
// `humps()` to the camelCase shape consumers code against. See each schema.ts header.

import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import humps from 'remeda-humps';

/** Validate `data` against `schema`, then camelCase it. Schema `default`s materialize first (a
 *  clone, so the caller's input is untouched), so a field a site omits arrives at its declared
 *  default (e.g. the mqtt endpoint version). Throws an aggregated error on faults. */
export function validateAndCamelize<T>(schema: TSchema, data: unknown, label: string): T {
  const filled = Value.Default(schema, Value.Clone(data));
  if (Value.Check(schema, filled)) return humps(filled as object) as T;
  const errors = [...Value.Errors(schema, filled)].map((e) => `  ${e.path || '/'}: ${e.message}`).join('\n');
  throw new Error(`Invalid ${label}:\n${errors}`);
}
