// Env overlay, derived from the schema's `x-env-var` annotations: a deployment's config value may
// arrive from a site file AND from the environment — env wins (override) and fills what the file
// omits (secrets like the MQTT password). Which env NAME feeds which field is not decided here: it
// travels with each field as `x-env-var` (authored as `schema.env-var` overrides in the concept
// YAML, e.g. archetypes/mqtt_connection.yaml), so this walk is a pure projection of the baked
// schema — add a field with an annotation and every consumer's overlay picks it up.
//
// Operates on the SNAKE_CASE value (pre-`parse*`): overlay first, then the concept's parser
// renames + validates the merged result — so an env-supplied value faces the exact same contract
// as a file-supplied one. The baked schema is camelCase; each node's `x-key-map` gives back the
// snake spelling this walk addresses the value under.

import type { TSchema } from '@sinclair/typebox';
import { snakeKeyByCamel } from '@nodeve/schema-case';

/** The slice of a baked schema node this walk reads. A TypeBox schema (the baked concept schema)
 *  IS a JSON-Schema object, so it satisfies this structurally after the boundary cast below. */
type SchemaNode = { properties?: Record<string, SchemaNode>; type?: string; 'x-env-var'?: string };

/** An env string coerced to the field's schema type (numbers arrive as strings from the env). */
const coerce = (schema: SchemaNode, raw: string): unknown =>
  schema.type === 'integer' || schema.type === 'number' ? Number(raw) : raw;

/**
 * Overlay `env` onto a (snake_case) `value` per the schema's `x-env-var` annotations: a set,
 * non-empty env var overrides the field; nested objects are created as needed so env can fill a
 * branch the file omits entirely. Returns the merged value (or `undefined` when neither source
 * supplies anything), ready for the concept's `parse*`. Takes the baked TypeBox schema; the walk
 * reads only its JSON-Schema slice.
 */
export function overlayEnvVars(schema: TSchema, value: unknown, env: Record<string, string | undefined>): unknown {
  return overlay(schema as unknown as SchemaNode, value, env);
}

function overlay(schema: SchemaNode, value: unknown, env: Record<string, string | undefined>): unknown {
  const props = schema.properties;
  if (!props) return value;
  const snakeOf = snakeKeyByCamel(schema);
  const out: Record<string, unknown> = { ...((value as Record<string, unknown>) ?? {}) };
  for (const [key, sub] of Object.entries(props)) {
    const at = snakeOf[key] ?? key; // the value is snake — address it by the field's source spelling
    const name = sub['x-env-var'];
    const raw = name ? env[name] : undefined;
    if (raw !== undefined && raw !== '') {
      out[at] = coerce(sub, raw);
    } else if (sub.properties) {
      const nested = overlay(sub, out[at], env);
      if (nested !== undefined) out[at] = nested;
    }
  }
  if (value === undefined && Object.keys(out).length === 0) return undefined;
  return out;
}
