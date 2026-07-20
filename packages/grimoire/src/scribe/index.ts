// scribe — grimoire's independent YAML→JSON front step. Raw YAML in, canonical JSON out: the
// `_defaults.yaml` cascade folded, `identity.slug` stamped, raw-only rules (comment blocks) enforced
// on the source text. It runs FIRST and owns every concern that only makes sense before the data is
// JSON; everything downstream (compile, project, emit, guards, site bake) reads the JSON it produces
// and never parses YAML. Published so any consumer — new catalog items, site-specific definitions —
// runs the SAME conversion (the `grimoire-scribe` bin, or these functions).
//
// Imports `yaml` + `fs` — the ONE YAML surface. The codegen (`pnpm scribe`) and the site compiler
// (`bakeSite`) drive it; the concept/catalog READ path (loadDevice, generated modules) never touches
// it and stays YAML-free.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type ScribeOptions, scribeTree } from './cascade.ts';
export { type ScribeOptions, scribeTree, readRaw } from './cascade.ts';
export { stampIdentity, type Obj } from './identity.ts';
export { validateConceptText } from './validate-raw.ts';

/** Serialize a desugared tree to one flat JSON object keyed by relative path — the `--stdout` shape,
 *  for a consumer piping the whole conversion downstream without touching disk. */
export function scribeObject(srcRoot: string, opts?: ScribeOptions): Record<string, unknown> {
	return Object.fromEntries([...scribeTree(srcRoot, opts)].sort(([a], [b]) => a.localeCompare(b)));
}

/** Convert `srcRoot`'s YAML tree and write the JSON mirror under `destRoot` (wiped first so no stale
 *  file survives a renamed/deleted source). Returns the number of files written. */
export function scribeToDir(srcRoot: string, destRoot: string, opts?: ScribeOptions): number {
	const tree = scribeTree(srcRoot, opts);
	rmSync(destRoot, { recursive: true, force: true });
	for (const [rel, doc] of tree) {
		const path = join(destRoot, rel);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(doc, null, '\t')}\n`);
	}
	return tree.size;
}
