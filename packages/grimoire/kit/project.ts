// The validation PROJECTION of a resolved concept data tree (kit/compile.ts): structure from the
// node's form, field shape from each leaf's `schema:` block; authored data (title/description/
// ui/refs) is not schema and is left behind — data first, schema derived. The `required` array is
// a projection artifact: each field marks itself with `schema.required: true` in the data tree,
// and an object node collects those into its draft-07 `required` (the flag never survives into the
// emitted schema).

import { clone, mergeDeep } from 'remeda';
import { type Obj, isObj } from './concept-sources.ts';

/** A field node marks itself mandatory via `schema.required: true` (authored, kept verbatim in the
 *  data tree). Its parent object reads this to build its draft-07 `required` array. */
const isRequired = (node: Obj): boolean => isObj(node.schema) && (node.schema as Obj).required === true;

/** A node's `schema:` block minus the field-level `required` flag — that boolean is the PARENT's
 *  signal (a `true` is projected into the parent's `required` array; a `false` relaxes a required
 *  flag inherited from a composed feature). Either way it is a marker, never this node's own draft-07
 *  schema content (where `required` must be an array), so strip it regardless of value. */
function patch(schema: Obj): Obj {
	const out = clone(schema);
	if ('required' in out) delete out.required;
	return out;
}

/** Deterministic JSON (keys sorted) — structural identity of a projected schema, so two shapes can
 *  be compared regardless of key order. */
export function stableStringify(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
	if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
	return JSON.stringify(v);
}

/** Ref hoisting during projection: a nested concept slot (tagged `$concept` by kit/compile.ts) whose
 *  shape is UNCHANGED from its standalone concept is emitted as `{$ref: <name>}` instead of restated
 *  inline — the composed-not-copied form the .schema.json ($defs) and the .ts (sibling const import)
 *  both render. `schemaOf` gives a concept's canonical inline projection (the equality test that keeps
 *  a shape-changing overlay inline); `deps` collects the concepts referenced. */
export interface RefContext {
	schemaOf: (name: string) => string;
	deps: Set<string>;
}

/** Project a resolved data node to its draft-07 validation schema. An object/array/map node's
 *  own `schema:` patch (override refinements: minItems, x-env-var, …) merges last. With `ref`, a
 *  tagged concept slot collapses to `{$ref: <name>}` when its shape matches the concept unchanged. */
export function projectSchema(node: Obj, ref?: RefContext): Obj {
	if (ref && typeof node.$concept === 'string' && stableStringify(projectSchema(node)) === ref.schemaOf(node.$concept)) {
		ref.deps.add(node.$concept);
		return { $ref: node.$concept };
	}
	let out: Obj;
	if (Array.isArray(node.anyOf)) {
		out = { anyOf: (node.anyOf as Obj[]).map((n) => projectSchema(n, ref)) };
	} else if (isObj(node.prop)) {
		const properties: Obj = {};
		const required: string[] = [];
		for (const [key, child] of Object.entries(node.prop as Obj)) {
			properties[key] = projectSchema(child as Obj, ref);
			if (isRequired(child as Obj)) required.push(key);
		}
		out = {
			type: 'object',
			properties,
			...(required.length > 0 ? { required: required.sort() } : {}),
			additionalProperties: false,
		};
	} else if (isObj(node.array)) {
		out = { type: 'array', items: projectSchema(node.array as Obj, ref) };
	} else if (isObj(node.map)) {
		out = { type: 'object', additionalProperties: projectSchema(node.map as Obj, ref) };
	} else {
		// A leaf field (its `schema:` block verbatim, sans the `required` flag) or a slot placeholder.
		return isObj(node.schema) ? patch(node.schema as Obj) : {};
	}
	return isObj(node.schema) ? mergeDeep(out, patch(node.schema as Obj)) : out;
}
