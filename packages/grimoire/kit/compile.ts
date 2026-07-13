// Public entry to the YAML→concept pipeline: resolve a concept to its data tree (kit/resolve.ts),
// or project that tree to its draft-07 validation schema (kit/project.ts). Data first, schema
// derived. BUILD- AND TEST-ONLY — nothing on the runtime path imports this.

import type { Obj } from '../src/concept-sources.ts';
import { projectSchema } from './project.ts';
import { resolveConcept } from './resolve.ts';

export { instructionKeys, resolveConcept } from './resolve.ts';

/** A named concept's standalone draft-07 schema — the validation projection of its data tree. */
export function compileConcept(slug: string): Obj {
	return projectSchema(resolveConcept(slug));
}
