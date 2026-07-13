// The DATA-tree slice of `pnpm generate`: a resolved concept → the authored, one-level-referential
// tree both data emits share (artifacts/<layer>/<slug>.json verbatim; the .ts default via
// remeda-humps). Composed, never restated: slots and compose roots hoist to `$ref` overlays that
// keep ONLY the keys the use site changes; `schema:` leaves strip (the schema lives once, in the
// .schema.json / <Name>Schema projection).

import { resolveConcept } from './compile.ts';
import { isPlainObject } from 'remeda';
import { projectSchema, stableStringify } from './project.ts';
import { type Obj, layerIndex } from '../src/concept-sources.ts';

/** A concept's canonical INLINE projection (no refs), memoized — the equality yardstick a `$ref`
 *  slot must match to be hoisted (a shape-changing overlay differs, so it stays inline). */
const inlineSchemaCache = new Map<string, string>();
export const inlineSchemaOf = (name: string): string => {
	let s = inlineSchemaCache.get(name);
	if (s === undefined) inlineSchemaCache.set(name, (s = stableStringify(projectSchema(resolveConcept(name)))));
	return s;
};

/** The structural keys a concept slot's `$ref` stands in for — replaced by the reference to the
 *  concept's own file, the rest of the node (authored title/refs/ui overlay) rides alongside. */
const STRUCTURAL = new Set(['prop', 'array', 'map', 'anyOf']);

/** The generated/ layer a concept slug's module lives under: features shadow archetypes shadow the
 *  property atoms — the same resolution order kit/compile.ts walks. */
export const layerOf = (name: string): string =>
	layerIndex('features').has(name) ? 'features' : layerIndex('archetypes').has(name) ? 'archetypes' : 'property';

/** The cross-file `$ref` a slot in `fromLayer` uses to point at concept `name`'s own generated data
 *  file — a sibling in the flat generated/ tree (`./x.json` same layer, `../features/x.json` across). */
function refPath(fromLayer: string, name: string): string {
	const toLayer = layerOf(name);
	return `${fromLayer === toLayer ? './' : `../${toLayer}/`}${name}.json`;
}

/** Referentialize a resolved DATA node — the data-tree twin of kit/project.ts's ref hoisting: a nested
 *  concept slot (tagged `$concept`) whose SHAPE is unchanged from its standalone concept — the same
 *  equality test project.ts runs — collapses to `{…authored overlay, $ref: <that concept's file>}`
 *  instead of splicing the concept's whole subtree in. The overlay keeps ONLY keys that DIFFER from
 *  the concept's own tree (a data fact lives once, in its own file — `modbus: {}` hoists to a bare
 *  `$ref`); a reader resolves the `$ref` across files (a resolve-time job). A shape-changing overlay
 *  fails the test and stays inline (recursing for deeper refs), exactly as the schema keeps it inline.
 *  The `$concept`/`$composes` tags never ship — replaced by `$ref` where a slot hoists, else dropped. */
function referentialize(node: unknown, fromLayer: string): unknown {
	if (Array.isArray(node)) return node.map((n) => referentialize(n, fromLayer));
	if (!isPlainObject(node)) return node;
	if (typeof node.$concept === 'string' && stableStringify(projectSchema(node)) === inlineSchemaOf(node.$concept)) {
		const base = rawDataTree(node.$concept);
		const rest = Object.entries(node)
			.filter(([k]) => k !== '$concept' && k !== '$composes' && !STRUCTURAL.has(k))
			.map(([k, v]) => [k, referentialize(v, fromLayer)] as const)
			.filter(([k, v]) => stableStringify(v) !== stableStringify(base[k]));
		return { ...Object.fromEntries(rest), $ref: refPath(fromLayer, node.$concept) };
	}
	return Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$concept' && k !== '$composes').map(([k, v]) => [k, referentialize(v, fromLayer)]));
}

/** A concept's own referentialized tree (unstripped), memoized — the diff base a use site's
 *  overlay compares against, so an unchanged data key never restates at the use site. */
const rawTreeCache = new Map<string, Obj>();
function rawDataTree(name: string): Obj {
	let t = rawTreeCache.get(name);
	if (t === undefined) {
		const { $composes: _c, ...def } = resolveConcept(name);
		rawTreeCache.set(name, (t = referentialize(def, layerOf(name)) as Obj));
	}
	return t;
}

/** The AUTHORED-data view of a resolved tree: the schema lives ONCE — the .schema.json / <Name>Schema
 *  projection — so a data tree carries only what's authored (title/description/refs/ui/…), never a
 *  `schema:` restatement. Strips each leaf's `schema:`; a node the strip leaves empty drops with it. */
function stripSchemaLeaves(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(stripSchemaLeaves);
	if (!isPlainObject(node)) return node;
	return Object.fromEntries(
		Object.entries(node)
			.filter(([k]) => k !== 'schema')
			.map(([k, v]) => [k, stripSchemaLeaves(v)] as const)
			.filter(([, v]) => !(isPlainObject(v) && Object.keys(v).length === 0)),
	);
}

/** A concept's emitted data tree: referentialized, authored-only, and — for a single-target compose
 *  (`$composes`) — folded to the same `$ref`-overlay form a slot uses: spread the base module's
 *  data, restate ONLY the keys the composer changes (Compose, don't restate). A multi-target
 *  compose stays inline — one `$ref` per node. */
export function conceptDataTree(def: Obj, layer: string, composes: unknown): Obj {
	const tree = stripSchemaLeaves(referentialize(def, layer)) as Obj;
	if (!Array.isArray(composes) || composes.length !== 1) return tree;
	const base = stripSchemaLeaves(rawDataTree(String(composes[0]))) as Obj;
	return {
		...Object.fromEntries(Object.entries(tree).filter(([k, v]) => stableStringify(v) !== stableStringify(base[k]))),
		$ref: refPath(layer, String(composes[0])),
	};
}
