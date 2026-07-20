// Catalog loader over the SCRIBED database (artifacts/database/catalog/). BUILD- AND TEST-ONLY: it
// reads JSON off disk, so nothing on the runtime path (index.ts, the generated bundle) may import
// it. scribe already folded the `_defaults.yaml` cascade and stamped `identity.slug` on every leaf;
// this walk just reads each leaf, pulls the archetype selector, and keeps the tree path (its stable
// cross-tree reference, e.g. `foxess/h3/ps-10.0-sh`). The codegen validates + camelCases each leaf and
// bakes it into generated/catalog/<slug>.json (no YAML parsed at runtime).
//
// The tree under catalog/<brand>/<family?>/<model>.json is PURE FILING — a leaf's schema comes from
// the `archetype` its cascade declared + the atom blocks it fills. The merged `archetype` selector
// (top-level `archetype_id` or `identity.archetype_id`) is stripped before validation (filing
// metadata, not a device field).

import { relative } from 'node:path';
import { isPlainObject } from 'remeda';
import { jsonFiles, readJson } from './concept-sources.ts';

/** A raw catalog leaf before schema validation: its tree path, declared archetype, and the scribed
 *  snake_case data (with the top-level `archetype_id` filing selector stripped out). */
export interface CascadeEntry {
	path: string; // tree path key, e.g. 'foxess/h3/ps-10.0-sh'
	archetype: string; // the archetype the cascade declared — selects the schema
	data: Record<string, unknown>; // scribed snake_case device data (no top-level `archetype_id`)
}

/** Load every catalog leaf under `root` (a scribed `catalog/` tree), sorted by tree path. Defaults
 *  and identity are already baked in by scribe; this only derives the archetype + path. */
export function loadCascade(root: string): CascadeEntry[] {
	return jsonFiles(root)
		.map((file) => {
			const merged = readJson(file);
			const { archetype_id: topLevel, ...data } = merged;
			// The archetype selector's two authored forms: top-level `archetype_id:` or the newer
			// `identity.archetype_id:` (identity stays in the data — it carries the slug, a device fact).
			const archetype =
				topLevel ?? (isPlainObject(data.identity) ? data.identity.archetype_id : undefined);
			const path = relative(root, file).replace(/\.json$/, '');
			if (typeof archetype !== 'string')
				throw new Error(
					`grimoire catalog leaf ${file} has no \`archetype_id\` (declare it in a _defaults.yaml)`,
				);
			return { path, archetype, data };
		})
		.sort((a, b) => a.path.localeCompare(b.path));
}
