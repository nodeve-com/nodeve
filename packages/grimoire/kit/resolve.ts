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

import { clone, isPlainObject, mergeDeep } from 'remeda';
import { type Obj, asList, fieldSource, layerIndex, propertyDoc, readYaml } from '../src/concept-sources.ts';
import { enumFields } from './enum-fields.ts';
import { type Resolver, type Shape, applyOverride, overridesOf } from './overrides.ts';
import { finishShape, specColumns } from './shape-finish.ts';

const LAYER_DIRS = ['features', 'archetypes'] as const;
type Layer = (typeof LAYER_DIRS)[number];

/** The def-language keys the pipeline consumes off a `def`, computed from the def itself — the SINGLE
 *  definition of the instruction vocabulary, shared by the resolver (seeds its `consumed` set, which
 *  dataOf drops) and generate.ts (strips them before validating a doc's DATA against the archetype).
 *  Replaces a hand-kept keyword table that duplicated the resolver's branches. `prop` is always
 *  consumed (own-field overlays); `schema` is the projection passthrough (kit/project.ts merges an
 *  object node's `schema:` block) — an instruction for the VALIDATOR, but the resolver keeps it as
 *  node data (dataOf must not drop it), so the resolver removes `schema` from its own `consumed`. */
export function instructionKeys(def: Obj): Set<string> {
	const keys = new Set<string>(['prop']);
	if (isPlainObject(def.concept_settings) && Object.keys(def.concept_settings).length > 0) keys.add('concept_settings');
	for (const verb of ['enums', 'feature', 'archetype', 'schema'] as const) {
		if (def[verb] !== undefined) keys.add(verb);
	}
	return keys;
}

/** Resolve a slug: features/ → archetypes/ → property (a scalar field). */
function resolveConceptBySlug(slug: string, stack: string[]): Obj {
	for (const dir of LAYER_DIRS) {
		const path = layerIndex(dir).get(slug);
		if (path) return resolveShapeDef(readYaml(path), [...stack, `${dir}/${slug}`], dir);
	}
	if (fieldSource(slug)) return resolveFieldBySlug(slug, stack);
	throw new Error(`grimoire compile: "${slug}" resolves to no feature/archetype/property (via ${stack.join(' → ')})`);
}

/** Resolve a `feature:` map entry — STRICTLY a features/ concept. A hit on the property layer (a
 *  bare field) or the archetype layer means a field/class was authored where a feature belongs;
 *  throw so the miscategorisation is visible instead of silently resolving down a layer. */
function resolveFeatureBySlug(slug: string, stack: string[]): Obj {
	const path = layerIndex('features').get(slug);
	if (!path) throw new Error(`grimoire compile: \`feature:\` entry "${slug}" is not a features/ concept — a feature groups props; a bare field belongs in a feature, not directly on the def (via ${stack.join(' → ')})`);
	return resolveShapeDef(readYaml(path), [...stack, `features/${slug}`], 'features');
}

/** Resolve an `archetype:` map entry — STRICTLY an archetypes/ concept, a sibling CLASS nested as a
 *  named slot (a connectivity medium like `modbus`). A hit on features/ or the property layer means
 *  a feature/field was authored where a nested archetype belongs; throw so the mislayer is visible. */
function resolveArchetypeBySlug(slug: string, stack: string[]): Obj {
	const path = layerIndex('archetypes').get(slug);
	if (!path) throw new Error(`grimoire compile: \`archetype:\` entry "${slug}" is not an archetypes/ concept — the archetype map nests a sibling class as a slot; a feature belongs in the \`feature:\` map (via ${stack.join(' → ')})`);
	return resolveShapeDef(readYaml(path), [...stack, `archetypes/${slug}`], 'archetypes');
}

/** Resolve a `compose:` target — a SIBLING in the composing def's own layer only (an archetype
 *  composes archetypes, a feature composes features). compose REUSES a table's columns; it never
 *  reaches across to a feature slot (add those via `feature:`) nor down to a scalar property. */
function resolveSiblingBySlug(slug: string, layer: Layer, stack: string[]): Obj {
	const path = layerIndex(layer).get(slug);
	if (!path) throw new Error(`grimoire compile: compose target "${slug}" is not a sibling ${layer.replace(/s$/, '')} — compose merges same-layer siblings only, add a feature via \`feature:\` (via ${stack.join(' → ')})`);
	return resolveShapeDef(readYaml(path), [...stack, `${layer}/${slug}`], layer);
}

/** A prop's field node: the property doc whole (its `schema:` block is the shape, the rest is
 *  data), OR — when the property declares a `feature:` binding (usually via its category
 *  `_defaults.yaml`) — that feature's resolved shape with the member's data overlaid. */
function resolveFieldBySlug(slug: string, stack: string[]): Obj {
	const { doc, path } = propertyDoc(slug);
	const { feature, ...data } = doc;
	delete data.identity; // filing metadata (the archetype selector), not field data
	// An authored `schema:` wins over a (category-default) `feature:` binding — the member is more specific.
	if (typeof feature === 'string' && !isPlainObject(data.schema)) {
		return { ...resolveConceptBySlug(feature, [...stack, `property/${slug}`]), ...clone(data) };
	}
	if (!isPlainObject(data.schema)) throw new Error(`grimoire compile: property "${slug}" (${path}) has no \`schema:\` block — a prop used as a field must declare one`);
	return clone(data);
}

/** Mark a nested feature/archetype SLOT with the concept it resolves to, so the schema projection
 *  (kit/project.ts) can emit it as a `$ref` — composed, not restated — when its shape is unchanged.
 *  Rides in the resolved concept tree only; stripped before the data emit (generate.ts). */
function tagConcept(node: Obj, slug: string): Obj {
	if (isPlainObject(node)) node.$concept = slug;
	return node;
}

// The rebind callback kit/overrides.ts walks back through.
const resolver: Resolver = { concept: resolveConceptBySlug };

/** Resolve one def (feature / archetype doc) to a data node. `layer` is the def's own layer
 *  (features / archetypes), used to restrict `compose:` to same-layer siblings. */
export function resolveShapeDef(def: Obj, stack: string[] = [], layer?: Layer): Obj {
	if (stack.length > 32) throw new Error(`grimoire compile: compose/feature cycle: ${stack.join(' → ')}`);

	// An archetype ASSEMBLES features (`feature:` map); it never authors a bare field. `prop:` is the
	// FEATURE-level verb (a feature groups props) — on an archetype it's a miscategorised feature.
	if (layer === 'archetypes' && isPlainObject(def.prop)) {
		throw new Error(`grimoire compile: archetype declares \`prop:\` — a field is a feature; move it under \`feature:\` (via ${stack.join(' → ')})`);
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
	const composeSlugs = settings.compose === undefined
		? []
		: typeof settings.compose === 'string'
			? [settings.compose]
			: asList(settings.compose, 'concept_settings.compose', stack);
	if (composeSlugs.length > 0 && layer === undefined) {
		throw new Error(`grimoire compile: cannot resolve \`compose:\` without a known layer (via ${stack.join(' → ')})`);
	}
	let composedData: Obj = {};
	for (const slug of composeSlugs) {
		const composed = resolveSiblingBySlug(slug, layer as Layer, stack);
		if (!isPlainObject(composed.prop)) {
			throw new Error(`grimoire compile: compose target "${slug}" is a scalar, not an object shape — a feature groups props (via ${stack.join(' → ')})`);
		}
		// The sibling's columns. A spec sibling resolves feature_spec-wrapped — reuse its
		// `combined` COLUMNS (specColumns), so the composer re-homes them under its OWN feature_spec.
		Object.assign(shape.prop, clone(specColumns(composed)));
		// The sibling's node data — everything but the shape — rides too; own def overlays it below.
		const { prop: _prop, $composes: _c, ...data } = composed;
		composedData = mergeDeep(composedData, clone(data)) as Obj;
	}

	// enums: one enum-valued field per named enumeration (kit/enum-fields.ts).
	Object.assign(shape.prop, enumFields(def.enums, stack));

	// feature: nested feature fields — a `<slug>: overlay` MAP, the archetype-level analog of `prop:`
	// (same no-rename rule: the key IS the feature slug). `<slug>: {}` includes the feature unchanged;
	// the overlay refines its resolved shape (kit/overrides.ts). This is how a feature is added to a
	// shape — never via `compose:`, which reuses a same-layer sibling's columns instead.
	if (def.feature !== undefined && !isPlainObject(def.feature)) {
		throw new Error(`grimoire compile: \`feature:\` must be a \`<slug>: overlay\` map (like \`prop:\`), not ${Array.isArray(def.feature) ? 'an array' : typeof def.feature} (via ${stack.join(' → ')})`);
	}
	const featureEntries = Object.entries(isPlainObject(def.feature) ? def.feature : {});

	// archetype: nested archetype fields — a `<slug>: overlay` MAP, the exact analog of `feature:`
	// but the slot's shape is a SIBLING ARCHETYPE (a connectivity medium like `modbus`), resolved
	// STRICTLY within archetypes/. The key IS the archetype slug (same no-rename rule); a
	// `{ archetype: <slug> }` overlay rebinds the slot's shape, letting the slot name differ. This is
	// how a class nests another class as a named slot — never via `compose:`, which reuses columns.
	if (def.archetype !== undefined && !isPlainObject(def.archetype)) {
		throw new Error(`grimoire compile: \`archetype:\` must be a \`<slug>: overlay\` map (like \`feature:\`), not ${Array.isArray(def.archetype) ? 'an array' : typeof def.archetype} (via ${stack.join(' → ')})`);
	}
	const archetypeEntries = Object.entries(isPlainObject(def.archetype) ? def.archetype : {});

	// Slot names (features + nested archetypes) a `prop:` entry must defer behind, so an overlay on a
	// slot lands after the slot itself is bound.
	const slotNames = new Set([...featureEntries, ...archetypeEntries].map(([name]) => name));

	// prop: one entry `<name>: overlay` per field. The key IS the property slug (same no-rename rule
	// as features), and it MUST resolve to a real property — a `prop:` entry references a FIELD, never
	// a feature slot. Each entry resolves its base — an already-composed/feature field it refines, or
	// the property `<name>` — then applies its overlay (kit/overrides.ts). `<name>: {}` includes the
	// field unchanged. A `feature:` rebind is rejected here: features are added ONLY via the `feature:`
	// map, so `prop:` can never conjure a slot. An entry is applied in TWO passes around `feature`: a
	// NEW own field is added before the feature fields, an overlay on a composed/feature field after —
	// the field order the projected TS interfaces carry.
	const propEntries = Object.entries(overridesOf(def));
	const applyProp = (name: string, body: unknown): void => {
		const overlay = isPlainObject(body) ? body : {};
		if ('feature' in overlay) {
			throw new Error(`grimoire compile: prop "${name}" declares a \`feature:\` rebind — a \`prop:\` entry references a property, never a feature slot; add features via the \`feature:\` map (via ${stack.join(' → ')})`);
		}
		const isPropInclude = !(name in shape.prop); // a NEW field pulled from the property layer, not an overlay on a composed/feature field
		const base = isPropInclude ? resolveFieldBySlug(name, stack) : (shape.prop[name] as Obj);
		const resolved = applyOverride(base, overlay, name, stack, resolver);
		// Tag a property include with its slug so an unchanged one hoists to a `$ref` at its own module
		// (kit/project.ts), composed not restated; an overlay refines the shape so it stays inline.
		shape.prop[name] = isPropInclude && layerIndex('property').has(name) ? tagConcept(resolved, name) : resolved;
	};

	// pass 1: own new fields (neither composed nor a feature) — added before the feature fields.
	const deferred = new Set<string>();
	for (const [name, body] of propEntries) {
		if (name in shape.prop || slotNames.has(name)) deferred.add(name);
		else applyProp(name, body);
	}

	// feature fields — bare slugs, the key IS the feature slug; resolve STRICTLY within features/
	// (a property/archetype hit throws), then apply the overlay (`{}` = unchanged), exactly as prop
	// does one layer down. A `{ feature: <slug> }` overlay is a SLOT rebind — the key is a slot name,
	// the overlay's `feature:` supplies the shape — so the base is empty and the key need not resolve.
	for (const [name, body] of featureEntries) {
		const overlay = isPlainObject(body) ? body : {};
		const base = 'feature' in overlay ? {} : resolveFeatureBySlug(name, stack);
		shape.prop[name] = tagConcept(applyOverride(base, overlay, name, stack, resolver), typeof overlay.feature === 'string' ? overlay.feature : name);
	}

	// archetype fields — bare slugs, the key IS the archetype slug; resolve STRICTLY within
	// archetypes/ (a feature/property hit throws), then apply the overlay (`{}` = unchanged), exactly
	// as the feature map does. A `{ archetype: <slug> }` overlay is a SLOT rebind — the key is a slot
	// name, the overlay's `archetype:` supplies the shape — so the base is empty and the key need not
	// resolve.
	for (const [name, body] of archetypeEntries) {
		const overlay = isPlainObject(body) ? body : {};
		const base = 'archetype' in overlay ? {} : resolveArchetypeBySlug(name, stack);
		shape.prop[name] = tagConcept(applyOverride(base, overlay, name, stack, resolver), typeof overlay.archetype === 'string' ? overlay.archetype : name);
	}

	// pass 2: overlays on composed/feature fields — applied after, keeping their existing position.
	for (const [name, body] of propEntries) if (deferred.has(name)) applyProp(name, body);

	// Finish: specification wrap, part/repeated expansion, array/map cardinality (kit/shape-finish.ts).
	const node = finishShape(def, settings, shape, consumed, stack, {
		archetype: resolveArchetypeBySlug,
		feature: resolveFeatureBySlug,
		concept: resolveConceptBySlug,
		field: resolveFieldBySlug,
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
