// The projected JSON Schema artifact — where it lives, and the one fact
// gen-json-schema cannot carry across.
//
// `is_a` is flattened away by the projection, so a stencil class loses the base
// it specializes; without that, a `feature_type` pin cannot be dispatched (a
// PartSet carries one and is not a FeatureOfInterest). stencil-link.ts stamps
// the base back on, check-catalog.ts reads it. The key is spelled ONCE, here —
// a writer and a reader spelling it apart would drift in silence.
import { abs, dumpJson, read, write } from './io.ts';

/** the shipped document: base classes + stencil, imports resolved, stands alone */
export const STENCIL_SCHEMA = abs('gen/catalog.schema.json');

/** its camelCase sibling for TS consumers — same document, declared property
 * names camelized, `x-key-map` stamped per renamed node. bin/camel-schema.ts */
export const CAMEL_SCHEMA = abs('gen/catalog.camel.schema.json');

const STENCIL_OF = 'x-stencil-of';

/** one class in the artifact — pinned slots select it, `x-stencil-of` scopes it */
export type StencilDef = { properties?: Record<string, { const?: unknown }> };

/** the artifact itself: classes under `$defs`, row-sets as root properties */
export type StencilSchema = {
	$defs: Record<string, StencilDef>;
	properties: Record<string, { $ref?: string; items?: { $ref?: string } }>;
};

export const readStencil = (): StencilSchema => JSON.parse(read(STENCIL_SCHEMA)) as StencilSchema;

export const writeStencil = (schema: unknown, path = STENCIL_SCHEMA): void =>
	write(path, dumpJson(schema, 2));

/** which base class this stencil specializes, or undefined for a base class */
export const stencilBase = (def: StencilDef): string | undefined =>
	(def as Record<string, unknown>)[STENCIL_OF] as string | undefined;

export const setStencilBase = (def: StencilDef, base: string): void => {
	(def as Record<string, unknown>)[STENCIL_OF] = base;
};
