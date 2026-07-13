// The CARDINALITY/SPECIFICATION tail of the compiler: once resolveShapeDef (kit/resolve.ts) has
// assembled a def's flat `shape.prop`, this turns that shape into its final node — wrapping spec
// columns, expanding repeated/parts features, and applying array/map cardinality. Split out so
// resolve.ts stays one responsibility (assembly); this owns shape FINISHING. The four resolvers it
// needs all recurse back into resolveShapeDef, so they're passed in rather than imported (resolve.ts
// owns them).
import { clone, omit } from 'remeda';
import { type Obj, isObj, layerIndex, readYaml } from '../src/concept-sources.ts';
import type { Shape } from './overrides.ts';

const FILING = new Set(['identity', 'slug']);

/** Slug→node resolvers borrowed from the compiler (each recurses into resolveShapeDef). */
export interface FinishResolvers {
	archetype: (slug: string, stack: string[]) => Obj;
	feature: (slug: string, stack: string[]) => Obj;
	concept: (slug: string, stack: string[]) => Obj;
	field: (slug: string, stack: string[]) => Obj;
}

/** Everything a def states that the resolver didn't consume as an instruction — the data its
 *  resolved node carries. `consumed` is filled by resolveShapeDef as it handles each verb, so the
 *  instruction vocabulary lives in the resolver's branches, not a keyword table. */
function dataOf(def: Obj, consumed: Set<string>): Obj {
	const out: Obj = {};
	for (const [key, v] of Object.entries(def)) {
		if (consumed.has(key) || FILING.has(key)) continue;
		out[key] = clone(v);
	}
	return out;
}

const objectNode = (data: Obj, shape: Shape): Obj => ({ ...data, prop: shape.prop });

/** A spec feature resolves feature_spec-wrapped ({prop:{feature_spec:{prop:{combined:{prop:<cols>}}}}});
 *  composing or parting it must reuse its `combined` COLUMNS, not nest its wrapper — dig them back
 *  out. A non-wrapped (non-spec) shape returns its own `prop`. */
export function specColumns(node: Obj): Obj {
	const prop = isObj(node.prop) ? (node.prop as Obj) : {};
	const fs = prop.feature_spec;
	if (isObj(fs) && isObj(fs.prop)) {
		const combined = (fs.prop as Obj).combined;
		if (isObj(combined) && isObj(combined.prop)) return combined.prop as Obj;
	}
	return prop;
}

/** Finish an assembled shape into its node: specification wrap, then part/repeated expansion, then
 *  array/map cardinality (else the plain object node). */
export function finishShape(def: Obj, settings: Obj, shape: Shape, consumed: Set<string>, stack: string[], r: FinishResolvers): Obj {
	// is_specification: true — this feature's props are quantity_kind COLUMNS whose VALUE is a
	// `specification` (archetypes/specification — identity + measurand + the `intervals` list of
	// rated bands), not the bare number the column's property declares. Replace each scalar field
	// with the specification archetype's shape, keeping the field's authored data (title/refs) as its
	// documentation. A field already an object node — a spec column composed in from another
	// `is_specification` feature — is skipped, never double-wrapped.
	if (settings.is_specification === true) {
		const specProps = (r.archetype('specification', stack).prop ?? {}) as Obj;
		for (const name of Object.keys(shape.prop)) {
			const field = shape.prop[name] as Obj;
			if (!isObj(field.schema)) continue; // composed spec column — already { prop: { intervals, … } }
			// drop the scalar `schema` — the field becomes the specification node ($concept-tagged so the
			// projection $refs it, not restates it 301×), its authored data kept as docs
			shape.prop[name] = { ...omit(field, ['schema']), prop: clone(specProps), $concept: 'specification' };
		}
	}

	// FEATURE_SPEC wrap (docs/feature-model.md "feature_spec direction"): a feature that CARRIES A
	// SPECIFICATION — marked `is_specification`, parted/counted, or composing a spec feature (whose
	// columns arrive $concept:specification-tagged) — nests its spec body {combined, default,
	// part|instances} under a `feature_spec` slot; `count` (grammar) nests under `concept_settings`.
	// A non-spec feature keeps its bare object node (cardinality / plain shape below).
	if (typeof settings.part === 'string' && settings.repeated === true) {
		throw new Error(`grimoire compile: parts XOR instances — a def declares \`part:\` or \`repeated: true\`, never both (via ${stack.join(' → ')})`);
	}
	const hasSpecCol = Object.values(shape.prop).some((v) => isObj(v) && (v as Obj).$concept === 'specification');
	const isSpec = settings.is_specification === true || typeof settings.part === 'string' || settings.repeated === true || hasSpecCol;
	if (isSpec) {
		const data = dataOf(def, consumed);
		// A feature that carries a specification also carries its own on-bus `identity` (the same
		// `identity` feature its spec columns compose): `identity.slug` is the feature's short handle in
		// a derived sensor id — a catalog entry authors it (e.g. `ac_phase_three_point → ac`), the site
		// bake reads it. Unauthored ⇒ the feature's own slug is used. This is the sanctioned, schema'd
		// home of what a site-level `feature_alias` map used to do at render time.
		// $concept-tag the injected identity (like the spec columns above) so the projection $refs the
		// identity feature instead of restating its shape in every spec feature's schema.
		const wrap = (spec: Shape, extra?: Obj): Obj => ({ ...data, prop: { identity: { ...r.feature('identity', stack), $concept: 'identity' }, ...extra, feature_spec: objectNode({}, spec) } });

		// PARTED (`part: <slug>`, a fixed parts map): combined = own cols + every kind's cols;
		// `default` KIND-keyed (default.ac_phase / default.ac_line — the base each part starts from);
		// `part` NAME-keyed (part.a … part.ca), each shaped by its kind. A kind feature resolves
		// feature_spec-wrapped, so compose its `combined` COLUMNS (specColumns), not the wrapper.
		if (typeof settings.part === 'string') {
			const path = layerIndex('parts').get(settings.part);
			if (!path) throw new Error(`grimoire compile: no parts/${settings.part}.yaml (via ${stack.join(' → ')})`);
			const parts = readYaml(path).parts;
			if (!isObj(parts)) throw new Error(`grimoire compile: parts/${settings.part}.yaml has no \`parts:\` map`);
			const combinedProp: Obj = { ...shape.prop };
			const defaultFields: Obj = {}; // kind-keyed
			const partFields: Obj = {}; // name-keyed
			for (const [kind, names] of Object.entries(parts)) {
				const kindCols = specColumns(r.concept(kind, [...stack, `parts/${settings.part}`]));
				Object.assign(combinedProp, clone(kindCols));
				defaultFields[kind] = objectNode({}, { prop: clone(kindCols) });
				for (const name of names as string[]) partFields[name] = objectNode({}, { prop: clone(kindCols) });
			}
			return wrap({
				prop: {
					combined: objectNode({}, { prop: combinedProp }),
					default: objectNode({}, { prop: defaultFields }),
					part: objectNode({}, { prop: partFields }),
				},
			});
		}

		// COUNTED (`repeated: true`): {combined, default, instances} under feature_spec; `count` under
		// concept_settings (the grammar layer, both on the def and on catalog instances).
		if (settings.repeated === true) {
			const cols = (): Obj => objectNode({}, { prop: clone(shape.prop) });
			const instanceRow = objectNode({}, { prop: { ...clone(shape.prop), ordinal: r.field('ordinal', stack) } });
			return wrap(
				{ prop: { combined: cols(), default: cols(), instances: { array: instanceRow } } },
				{ concept_settings: objectNode({}, { prop: { count: r.field('count', stack) } }) },
			);
		}

		// PARTLESS spec feature — its columns ARE the whole; author them under `combined`.
		return wrap({ prop: { combined: objectNode({}, shape) } });
	}

	// concept_settings cardinality: a LIST of this shape (features/refs.yaml: crosswalk rows;
	// plural slug = array, per the naming rule) or a slug-keyed RECORD of it
	// (features/vedirect_fields.yaml). Intrinsic to the feature, never a use-site override.
	if (settings.is_array === true) return { ...dataOf(def, consumed), array: objectNode({}, shape) };
	if (settings.map === true) return { ...dataOf(def, consumed), map: objectNode({}, shape) };

	return objectNode(dataOf(def, consumed), shape);
}
