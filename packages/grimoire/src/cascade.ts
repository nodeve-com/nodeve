// Cascade loader for the catalog tree. BUILD- AND TEST-ONLY: it imports `yaml` + `fs`, so
// nothing on the runtime path (index.ts, the generated bundle) may import it. The codegen walks
// the tree here, validates + camelCases each leaf, and bakes each entry into
// generated/catalog/<slug>.json — what consumers read (no YAML parsed at runtime).
//
// The tree under catalog/<brand>/<family?>/<model>.yaml is PURE FILING — the schema of a leaf
// comes entirely from the `archetype` its dir cascade declares + the atom blocks the leaf fills.
// A `_defaults.yaml` at any level deep-merges into every descendant (leaf wins on conflict;
// arrays replace, not append). The merged `archetype` selector picks the schema; it is stripped
// before validation (it's filing metadata, not a device field). Each leaf is keyed by its tree
// path (e.g. `foxess/h3/ps-10.0-sh`), the stable cross-tree reference (site → catalog, ha-config
// → catalog).

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isPlainObject, mergeDeep } from 'remeda';
import { readYaml } from './concept-sources.ts';

type Obj = Record<string, unknown>;

/** A raw, merged catalog leaf before schema validation: its tree path, declared archetype, the
 *  deep-merged snake_case data (with `archetype`/`aliases` filing metadata stripped out), and any
 *  former paths this leaf used to live at (the inline changelog — see `aliases` in the README). */
export interface CascadeEntry {
  path: string; // tree path key, e.g. 'foxess/h3/ps-10.0-sh'
  archetype: string; // the archetype the dir cascade declares — selects the schema
  aliases: unknown; // raw former-paths value; field-validated against CatalogEnvelopeSchema in load.ts
  data: Record<string, unknown>; // merged snake_case device data (no `archetype`/`aliases` keys)
}


/** An entry's effective slug — `identity.slug` when authored, else the file stem verbatim. THE
 *  identity a consumer references and every derived sensor id starts from
 *  (PLANS/deterministic-sensor-ids.md); the tree path is filing only. Shared by every dir→instances
 *  bake (catalog codegen + site compiler). The stem is NOT transformed — a non-slug stem stays
 *  non-slug and its entry's schema (slug.yaml pattern) rejects it, forcing an authored identity.slug. */
export function effectiveSlug(path: string, identity: Record<string, unknown>): string {
  return typeof identity.slug === 'string' ? identity.slug : path.split('/').pop()!;
}

// The cascade deep-merges `over` onto `base` via remeda's `mergeDeep`: nested objects merge
// recursively; arrays and scalars REPLACE (a leaf's register map replaces a family's, never
// appends — see the README cascade note).

const isDefaults = (f: string): boolean => f === '_defaults.yaml';
const isLeaf = (f: string): boolean => f.endsWith('.yaml') && !isDefaults(f) && !f.endsWith('.example.yaml');

/** Walk `dir`, accumulating the cascaded `_defaults.yaml` from the root down. */
function walkCascade(dir: string, segments: string[], inherited: Obj, out: CascadeEntry[]): void {
  const names = readdirSync(dir, { withFileTypes: true });
  // Fold this level's _defaults.yaml into the inherited context before descending/leafing.
  const defaultsFile = names.find((e) => e.isFile() && isDefaults(e.name));
  const ctx = defaultsFile ? (mergeDeep(inherited, readYaml(join(dir, defaultsFile.name))) as Obj) : inherited;

  for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      walkCascade(join(dir, entry.name), [...segments, entry.name], ctx, out);
    } else if (isLeaf(entry.name)) {
      const merged = mergeDeep(ctx, readYaml(join(dir, entry.name))) as Obj;
      const { archetype_id: topLevel, aliases, ...data } = merged;
      // The archetype selector's two authored forms: top-level `archetype_id:` or the newer
      // `identity.archetype_id:` (identity stays in the data — it carries the slug and is device fact).
      const archetype = topLevel ?? (isPlainObject(data.identity) ? data.identity.archetype_id : undefined);
      const path = [...segments, entry.name.replace(/\.yaml$/, '')].join('/');
      if (typeof archetype !== 'string') {
        throw new Error(`grimoire catalog leaf ${join(dir, entry.name)} has no \`archetype_id\` (declare it in a _defaults.yaml)`);
      }
      // The path is FILING only — its stem needn't be a slug (catalog uses hyphens/dots, e.g.
      // `ps-10.0-sh`). The identity slug is DERIVED (effectiveSlug) + validated against the
      // slug.yaml pattern by each entry's schema; that is the single definition of a valid slug.
      out.push({ path, archetype, aliases, data });
    }
  }
}

/** Load every catalog leaf under `root`, deep-merging the `_defaults.yaml` cascade, sorted by path. */
export function loadCascade(root: string): CascadeEntry[] {
  const out: CascadeEntry[] = [];
  walkCascade(root, [], {}, out);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
