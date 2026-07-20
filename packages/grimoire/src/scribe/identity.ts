// Identity stamping — the one desugar an IDENTIFIED thing gets. `identity.slug` is the stable
// reference a consumer keys on (the tree path is filing only): authored `identity.slug` wins, else
// the file stem verbatim. `identity.archetype_id` is NOT computed here — it arrives via the
// `_defaults.yaml` cascade (every concept layer declares its class), so identity is uniformly data,
// never code. The stem is NOT transformed: a non-slug stem (catalog's `ps-10.0-sh`) stays non-slug
// and its schema rejects it downstream, forcing an authored `identity.slug`.
//
// Only docs that ALREADY carry an `identity` block are stamped — that block (authored, or seeded by
// a layer's `_defaults`) is what marks a leaf as an identified thing. A singleton concept file with
// no identity (a site's top-level `site.yaml`) is left untouched; a spurious `slug` there would only
// break its schema.

import { isPlainObject } from 'remeda';

export type Obj = Record<string, unknown>;

/** `doc` with `identity.slug` filled from `stem` when the doc declares an `identity` (authored slug
 *  wins). A doc with no `identity` is returned unchanged. Idempotent. */
export function stampIdentity(doc: Obj, stem: string): Obj {
	if (!isPlainObject(doc.identity)) return doc;
	const identity = doc.identity as Obj;
	const slug = typeof identity.slug === 'string' ? identity.slug : stem;
	return { ...doc, identity: { ...identity, slug } };
}
