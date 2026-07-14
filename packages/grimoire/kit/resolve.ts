// YAML→concept RESOLUTION ENGINE: compose the
// concept layers — property → features → archetypes (concepts/README.md) — into ONE
// resolved DATA TREE per concept: everything authored (title, description, ui, refs, …)
// at every node, with each field's `schema:` block in place. The draft-07 validation schema is a
// PROJECTION of that tree (kit/project.ts), not a separate compilation — data first, schema
// derived. Override semantics live in kit/overrides.ts. The thin public entry (`resolveConcept` /
// `compileConcept`) wraps this in kit/compile.ts. BUILD- AND TEST-ONLY (imports `yaml` + `fs`):
// codegen bakes the resolved trees and projected schemas into generated/ and consumers
// read those; nothing on the runtime path imports this.
//
// Resolved node forms (plain objects; authored data keys ride alongside the structural key). The
// vocabulary is the YAML's own — a resolved tree is the DESUGARED def, not a schema in disguise;
// the draft-07 schema is a separate projection (kit/project.ts):
//   { prop: {key: node} }                       — an object shape (feature / archetype).
//                 Each field carries its own `schema.required`; there is NO synthesized `required`
//                 array on the parent (that's schema vocabulary, derived in the projection).
//   { array: node } / { map: node }             — cardinality wrappers
//   { schema: {…} }                             — a leaf field: the property doc, `schema:` verbatim
//   {}                                          — a slot placeholder awaiting a feature rebind
//
// Composition semantics (the authoritative list — concepts/README.md sketches, this implements):
//   - A PROPERTY (property/<category>/<slug>.yaml) contributes its whole doc — `schema:` is the
//     only place field shape is coined; the rest of the doc is the field's data. A property is a
//     FIELD, never a feature: a feature groups props (must resolve to an object shape), never IS a prop.
//   - A shape def (feature / archetype file) builds one object node
//     (optional-by-default; projection closes it with `additionalProperties: false`) from:
//       enums:    [category…]        — one field per category, `enum:` of the member file stems.
//       feature: {slug: overlay…}    — one NESTED field per entry; the key IS the feature slug (a
//                 use-site rename would break the name→def lookup chain). A `<slug>: overlay` MAP,
//                 the archetype-level analog of `prop:`: `{}` includes it unchanged, the overlay
//                 refines the resolved feature shape. This is the ONLY way to add a feature.
//       archetype: {slug: overlay…}  — the exact analog for nesting a SIBLING ARCHETYPE as a named
//                 slot (a connectivity medium like `modbus`); key IS the archetype slug, resolved
//                 strictly within archetypes/. This is the ONLY way to nest a class in a class.
//       concept_settings: {…}        — the def-language grammar block, legal on features AND
//                 archetypes (concepts/features/concept_settings.yaml):
//                   compose: slug | [slug…]  — REUSE a same-layer SIBLING table's columns (an
//                     archetype composes archetypes, a feature composes features — never a feature slot).
//                   repeated: true           — countable instances ({count, combined?, default?, instances?}).
//                   part: <slug>             — a fixed parts map ({combined?, default?, part?}).
//                   is_array | map: true     — the def's intrinsic cardinality (list / slug-keyed record).
//       prop:     {name: overlay…}   — one field per entry; the key IS a PROPERTY slug (never a
//                 feature — a `feature:` rebind in a prop overlay is rejected; slots come from the
//                 `feature:` map). `{}` includes it unchanged; the overlay refines it (schema patch,
//                 child descent) — kit/overrides.ts. Outer def wins over composed source.

import { clone, isPlainObject, mergeDeep, omit } from 'remeda';
import { type Obj, asList, instructionKeys, layerIndex } from '../src/concept-sources.ts';
import { enumFields } from './enum-fields.ts';
import { type Resolver, type Shape, applyOverride, overridesOf } from './overrides.ts';
import { finishShape, specColumns } from './shape-finish.ts';
import {
	type Layer,
	resolveArchetypeBySlug,
	resolveConceptBySlug,
	resolveFeatureBySlug,
	resolveFieldBySlug,
	resolveSiblingBySlug,
} from './resolve-slug.ts';


/** Mark a nested feature/archetype SLOT with the concept it resolves to, so the schema projection
 *  (kit/project.ts) can emit it as a `$ref` — composed, not restated — when its shape is unchanged.
 *  Rides in the resolved concept tree only; stripped before the data emit (generate.ts). */
function tagConcept(node: Obj, slug: string): Obj {
	if (isPlainObject(node)) node.$concept = slug;
	return node;
}

// The rebind callback kit/overrides.ts walks back through.
const resolver: Resolver = { concept: resolveConceptBySlug };

function compositionSlugs(settings: Obj, stack: string[], layer?: Layer): string[] {
	const slugs =
		settings.compose === undefined
			? []
			: typeof settings.compose === 'string'
				? [settings.compose]
				: asList(settings.compose, 'concept_settings.compose', stack);
	if (slugs.length > 0 && layer === undefined)
		throw new Error(
			`grimoire compile: cannot resolve \`compose:\` without a known layer (via ${stack.join(' → ')})`,
		);
	return slugs;
}

function pureReuse(options: {
	def: Obj;
	settings: Obj;
	slugs: string[];
	layer?: Layer;
	stack: string[];
	consumed: Set<string>;
}): Obj | null {
	const { def, settings, slugs, layer, stack, consumed } = options;
	const noOwnShape =
		!isPlainObject(def.prop) &&
		def.feature === undefined &&
		def.archetype === undefined &&
		def.enums === undefined &&
		settings.is_specification !== true &&
		settings.part === undefined &&
		settings.repeated !== true &&
		settings.is_array !== true &&
		settings.map !== true;
	if (slugs.length !== 1 || !noOwnShape) return null;
	const composed = resolveSiblingBySlug(slugs[0]!, layer as Layer, stack);
	if (!isPlainObject(composed.prop))
		throw new Error(
			`grimoire compile: compose target "${slugs[0]}" is a scalar, not an object shape — a feature groups props (via ${stack.join(' → ')})`,
		);
	const ownData: Obj = {};
	for (const [key, value] of Object.entries(def))
		if (!consumed.has(key) && key !== 'slug') ownData[key] = clone(value);
	return { ...clone(omit(composed, ['$composes'])), ...ownData, $composes: [slugs[0]] };
}

function composeIntoShape(options: {
	shape: Shape;
	slugs: string[];
	layer?: Layer;
	stack: string[];
}): Obj {
	const { shape, slugs, layer, stack } = options;
	let data: Obj = {};
	for (const slug of slugs) {
		const composed = resolveSiblingBySlug(slug, layer as Layer, stack);
		if (!isPlainObject(composed.prop))
			throw new Error(
				`grimoire compile: compose target "${slug}" is a scalar, not an object shape — a feature groups props (via ${stack.join(' → ')})`,
			);
		Object.assign(shape.prop, clone(specColumns(composed)));
		data = mergeDeep(data, clone(omit(composed, ['prop', '$composes']))) as Obj;
	}
	return data;
}

function slotEntries(def: Obj, kind: 'feature' | 'archetype', stack: string[]) {
	const value = def[kind];
	if (value !== undefined && !isPlainObject(value))
		throw new Error(
			`grimoire compile: \`${kind}:\` must be a \`<slug>: overlay\` map (like \`prop:\`), not ${Array.isArray(value) ? 'an array' : typeof value} (via ${stack.join(' → ')})`,
		);
	return Object.entries(isPlainObject(value) ? value : {});
}

function addSlot(options: {
	shape: Shape;
	name: string;
	body: unknown;
	kind: 'feature' | 'archetype';
	stack: string[];
}): void {
	const { shape, name, body, kind, stack } = options;
	const overlay = isPlainObject(body) ? body : {};
	const base =
		kind in overlay
			? {}
			: kind === 'feature'
				? resolveFeatureBySlug(name, stack)
				: resolveArchetypeBySlug(name, stack);
	const resolved = applyOverride({ node: base, overlay, key: name, stack, resolve: resolver });
	shape.prop[name] = tagConcept(
		resolved,
		typeof overlay[kind] === 'string' ? (overlay[kind] as string) : name,
	);
}

function applyProperty(options: {
	shape: Shape;
	name: string;
	body: unknown;
	stack: string[];
}): void {
	const { shape, name, body, stack } = options;
	const overlay = isPlainObject(body) ? body : {};
	if ('feature' in overlay)
		throw new Error(
			`grimoire compile: prop "${name}" declares a \`feature:\` rebind — a \`prop:\` entry references a property, never a feature slot; add features via the \`feature:\` map (via ${stack.join(' → ')})`,
		);
	const included = !(name in shape.prop);
	const base = included ? resolveFieldBySlug(name, stack) : (shape.prop[name] as Obj);
	const resolved = applyOverride({ node: base, overlay, key: name, stack, resolve: resolver });
	shape.prop[name] =
		included && layerIndex('property').has(name) ? tagConcept(resolved, name) : resolved;
}

function assembleFields(def: Obj, shape: Shape, stack: string[]): void {
	const features = slotEntries(def, 'feature', stack);
	const archetypes = slotEntries(def, 'archetype', stack);
	const slots = new Set([...features, ...archetypes].map(([name]) => name));
	const properties = Object.entries(overridesOf(def));
	const deferred = new Set<string>();
	for (const [name, body] of properties) {
		if (name in shape.prop || slots.has(name)) deferred.add(name);
		else applyProperty({ shape, name, body, stack });
	}
	for (const [name, body] of features) addSlot({ shape, name, body, kind: 'feature', stack });
	for (const [name, body] of archetypes) addSlot({ shape, name, body, kind: 'archetype', stack });
	for (const [name, body] of properties)
		if (deferred.has(name)) applyProperty({ shape, name, body, stack });
}

/** Resolve one def (feature / archetype doc) to a data node. `layer` is the def's own layer
 *  (features / archetypes), used to restrict `compose:` to same-layer siblings. */
export function resolveShapeDef(def: Obj, stack: string[] = [], layer?: Layer): Obj {
	if (stack.length > 32)
		throw new Error(`grimoire compile: compose/feature cycle: ${stack.join(' → ')}`);

	// An archetype ASSEMBLES features (`feature:` map); it never authors a bare field. `prop:` is the
	// FEATURE-level verb (a feature groups props) — on an archetype it's a miscategorised feature.
	if (layer === 'archetypes' && isPlainObject(def.prop)) {
		throw new Error(
			`grimoire compile: archetype declares \`prop:\` — a field is a feature; move it under \`feature:\` (via ${stack.join(' → ')})`,
		);
	}

	// Instruction keys the resolver consumes; everything else a def states is node data (dataOf).
	// Seeded from the shared instructionKeys(); `schema` is excluded — it's a projection passthrough
	// kept as node data (kit/project.ts merges it), not dropped like the compile verbs.
	const consumed = instructionKeys(def);
	consumed.delete('schema');

	const shape: Shape = { prop: {} };

	// concept_settings (concepts/features/concept_settings.yaml — the def-language grammar block,
	// defined as concepts, legal on features AND archetypes):
	//   compose:  slug | [slug…]  — REUSE the named tables' columns (single slug or list; the
	//             old `alias`, a same-shape rename, is just a one-element compose).
	//   repeated / part           — the countable / fixed-parts expansions (handled below).
	//   array / map               — the def's intrinsic cardinality.
	const settings = isPlainObject(def.concept_settings) ? def.concept_settings : {};

	// compose: a LITERAL overlay — the named sibling's WHOLE resolved node merges in, first-listed
	// first (later + own def win): its columns into the shape, its node DATA (title/description/
	// refs/ui…) under the composer's own. A compose target MUST be an object shape — a feature
	// groups props, it never IS a scalar prop.
	const composeSlugs = compositionSlugs(settings, stack, layer);
	// PURE REUSE (README "same-shape reuse under a new name"): a def composing ONE sibling and adding no
	// own shape IS that sibling renamed. Reuse its WHOLE resolved node (feature_spec/part intact, not the
	// `combined` columns the generic loop digs out), overlaying own data; `$composes` folds to a `$ref`.
	const reused = pureReuse({ def, settings, slugs: composeSlugs, layer, stack, consumed });
	if (reused) return reused;
	const composedData = composeIntoShape({ shape, slugs: composeSlugs, layer, stack });

	// enums: one enum-valued field per named enumeration (kit/enum-fields.ts).
	Object.assign(shape.prop, enumFields(def.enums, stack));
	assembleFields(def, shape, stack);

	// Finish: specification wrap, part/repeated expansion, array/map cardinality (kit/shape-finish.ts).
	const node = finishShape({
		def,
		settings,
		shape,
		consumed,
		stack,
		resolvers: {
			archetype: resolveArchetypeBySlug,
			feature: resolveFeatureBySlug,
			concept: resolveConceptBySlug,
			field: resolveFieldBySlug,
		},
	});
	// compose is a literal overlay: the composed data sits UNDER the finished node (own def wins).
	// `$composes` records the provenance so the emit can render the root composed, not restated
	// (generate.ts folds it to a `$ref` overlay); stripped like `$concept` wherever it doesn't fold.
	if (composeSlugs.length === 0) return node;
	return { ...(mergeDeep(composedData, node) as Obj), $composes: composeSlugs };
}

/** Resolve a named concept (archetype / feature) to its full data tree. */
export function resolveConcept(slug: string): Obj {
	return resolveConceptBySlug(slug, [slug]);
}
