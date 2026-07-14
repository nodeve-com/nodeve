// Slug → resolved-node lookups for the resolution engine (kit/resolve.ts). Each maps a name in one of
// the def-language maps (`compose:`, `feature:`, `archetype:`, `prop:`) to the layer it MUST resolve
// against, throwing when a name is authored on the wrong layer so miscategorisation stays visible.
// Recursive back into resolveShapeDef — an ESM cycle with resolve.ts, safe because nothing calls these
// at module-init time.

import { clone, isPlainObject } from 'remeda';
import {
	type Obj,
	fieldSource,
	layerIndex,
	propertyDoc,
	readYaml,
} from '../src/concept-sources.ts';
import { identityData } from './shape-finish.ts';
import { resolveShapeDef } from './resolve.ts';

export const LAYER_DIRS = ['features', 'archetypes'] as const;
export type Layer = (typeof LAYER_DIRS)[number];

/** Resolve a slug: features/ → archetypes/ → property (a scalar field). */
export function resolveConceptBySlug(slug: string, stack: string[]): Obj {
	for (const dir of LAYER_DIRS) {
		const path = layerIndex(dir).get(slug);
		if (path) return resolveShapeDef(readYaml(path), [...stack, `${dir}/${slug}`], dir);
	}
	if (fieldSource(slug)) return resolveFieldBySlug(slug, stack);
	throw new Error(
		`grimoire compile: "${slug}" resolves to no feature/archetype/property (via ${stack.join(' → ')})`,
	);
}

/** Resolve a `feature:` map entry — STRICTLY a features/ concept. A hit on the property layer (a
 *  bare field) or the archetype layer means a field/class was authored where a feature belongs;
 *  throw so the miscategorisation is visible instead of silently resolving down a layer. */
export function resolveFeatureBySlug(slug: string, stack: string[]): Obj {
	const path = layerIndex('features').get(slug);
	if (!path)
		throw new Error(
			`grimoire compile: \`feature:\` entry "${slug}" is not a features/ concept — a feature groups props; a bare field belongs in a feature, not directly on the def (via ${stack.join(' → ')})`,
		);
	return resolveShapeDef(readYaml(path), [...stack, `features/${slug}`], 'features');
}

/** Resolve an `archetype:` map entry — STRICTLY an archetypes/ concept, a sibling CLASS nested as a
 *  named slot (a connectivity medium like `modbus`). A hit on features/ or the property layer means
 *  a feature/field was authored where a nested archetype belongs; throw so the mislayer is visible. */
export function resolveArchetypeBySlug(slug: string, stack: string[]): Obj {
	const path = layerIndex('archetypes').get(slug);
	if (!path)
		throw new Error(
			`grimoire compile: \`archetype:\` entry "${slug}" is not an archetypes/ concept — the archetype map nests a sibling class as a slot; a feature belongs in the \`feature:\` map (via ${stack.join(' → ')})`,
		);
	return resolveShapeDef(readYaml(path), [...stack, `archetypes/${slug}`], 'archetypes');
}

/** Resolve a `compose:` target — a SIBLING in the composing def's own layer only (an archetype
 *  composes archetypes, a feature composes features). compose REUSES a table's columns; it never
 *  reaches across to a feature slot (add those via `feature:`) nor down to a scalar property. */
export function resolveSiblingBySlug(slug: string, layer: Layer, stack: string[]): Obj {
	const path = layerIndex(layer).get(slug);
	if (!path)
		throw new Error(
			`grimoire compile: compose target "${slug}" is not a sibling ${layer.replace(/s$/, '')} — compose merges same-layer siblings only, add a feature via \`feature:\` (via ${stack.join(' → ')})`,
		);
	return resolveShapeDef(readYaml(path), [...stack, `${layer}/${slug}`], layer);
}

/** A prop's field node: the property doc whole (its `schema:` block is the shape, the rest is
 *  data), OR — when the property declares a `feature:` binding (usually via its category
 *  `_defaults.yaml`) — that feature's resolved shape with the member's data overlaid. */
export function resolveFieldBySlug(slug: string, stack: string[]): Obj {
	const { doc, path } = propertyDoc(slug);
	const { feature, identity: rawIdentity, ...data } = doc;
	const identity = identityData(rawIdentity); // filing selectors stripped; the data keys ship
	if (identity) data.identity = identity;
	// An authored `schema:` wins over a (category-default) `feature:` binding — the member is more specific.
	if (typeof feature === 'string' && !isPlainObject(data.schema)) {
		return { ...resolveConceptBySlug(feature, [...stack, `property/${slug}`]), ...clone(data) };
	}
	if (!isPlainObject(data.schema))
		throw new Error(
			`grimoire compile: property "${slug}" (${path}) has no \`schema:\` block — a prop used as a field must declare one`,
		);
	return clone(data);
}
