// The CARDINALITY/SPECIFICATION tail of the compiler: once resolveShapeDef (kit/resolve.ts) has
// assembled a def's flat `shape.prop`, this turns that shape into its final node — wrapping spec
// columns, expanding repeated/parts features, and applying array/map cardinality. Split out so
// resolve.ts stays one responsibility (assembly); this owns shape FINISHING. The four resolvers it
// needs all recurse back into resolveShapeDef, so they're passed in rather than imported (resolve.ts
// owns them).
import { clone, isPlainObject, omit } from 'remeda';
import { type Obj, layerIndex, readYaml } from '../src/concept-sources.ts';
import type { Shape } from './overrides.ts';

const FILING = new Set(['slug']);

/** An authored `identity` minus the filing selectors (archetype/id — concepts/README.md): the data
 *  keys that ship with the def (slug/code/symbol/…), or undefined when nothing remains. */
export function identityData(v: unknown): Obj | undefined {
	if (!isPlainObject(v)) return undefined;
	const identity = omit(v, ['archetype_id', 'id']);
	return Object.keys(identity).length > 0 ? identity : undefined;
}

/** Slug→node resolvers borrowed from the compiler (each recurses into resolveShapeDef). */
export interface FinishResolvers {
	archetype: (slug: string, stack: string[]) => Obj;
	feature: (slug: string, stack: string[]) => Obj;
	concept: (slug: string, stack: string[]) => Obj;
	field: (slug: string, stack: string[]) => Obj;
}

type FinishOptions = {
	def: Obj;
	settings: Obj;
	shape: Shape;
	consumed: Set<string>;
	stack: string[];
	resolvers: FinishResolvers;
};

/** Everything a def states that the resolver didn't consume as an instruction — the data its
 *  resolved node carries. `consumed` is filled by resolveShapeDef as it handles each verb, so the
 *  instruction vocabulary lives in the resolver's branches, not a keyword table. */
function dataOf(def: Obj, consumed: Set<string>): Obj {
	const out: Obj = {};
	for (const [key, v] of Object.entries(def)) {
		if (consumed.has(key) || FILING.has(key)) continue;
		if (key === 'identity') {
			const identity = identityData(v);
			if (identity) out.identity = clone(identity);
			continue;
		}
		out[key] = clone(v);
	}
	return out;
}

const objectNode = (data: Obj, shape: Shape): Obj => ({ ...data, prop: shape.prop });

/** A spec feature resolves feature_spec-wrapped ({prop:{feature_spec:{prop:{combined:{prop:<cols>}}}}});
 *  composing or parting it must reuse its `combined` COLUMNS, not nest its wrapper — dig them back
 *  out. A non-wrapped (non-spec) shape returns its own `prop`. */
export function specColumns(node: Obj): Obj {
	const prop = isPlainObject(node.prop) ? (node.prop as Obj) : {};
	const fs = prop.feature_spec;
	if (isPlainObject(fs) && isPlainObject(fs.prop)) {
		const combined = (fs.prop as Obj).combined;
		if (isPlainObject(combined) && isPlainObject(combined.prop)) return combined.prop as Obj;
	}
	return prop;
}

function expandSpecificationFields(options: FinishOptions): void {
	if (options.settings.is_specification !== true) return;
	const specProps = (options.resolvers.archetype('specification', options.stack).prop ?? {}) as Obj;
	for (const name of Object.keys(options.shape.prop)) {
		const field = options.shape.prop[name] as Obj;
		if (!isPlainObject(field.schema)) continue;
		options.shape.prop[name] = {
			...omit(field, ['schema']),
			prop: clone(specProps),
			$concept: 'specification',
		};
	}
}

function wrapSpecification(options: FinishOptions, spec: Shape, extra?: Obj): Obj {
	return {
		...dataOf(options.def, options.consumed),
		prop: {
			identity: {
				...options.resolvers.feature('identity', options.stack),
				$concept: 'identity',
			},
			...extra,
			feature_spec: objectNode({}, spec),
		},
	};
}

function partedSpecification(options: FinishOptions, part: string): Obj {
	const path = layerIndex('parts').get(part);
	if (!path)
		throw new Error(`grimoire compile: no parts/${part}.yaml (via ${options.stack.join(' → ')})`);
	const parts = readYaml(path).parts;
	if (!isPlainObject(parts))
		throw new Error(`grimoire compile: parts/${part}.yaml has no \`parts:\` map`);
	const combined: Obj = { ...options.shape.prop };
	const defaults: Obj = {};
	const fields: Obj = {};
	for (const [kind, names] of Object.entries(parts)) {
		const columns = specColumns(
			options.resolvers.concept(kind, [...options.stack, `parts/${part}`]),
		);
		Object.assign(combined, clone(columns));
		defaults[kind] = objectNode({}, { prop: clone(columns) });
		for (const name of names as string[]) fields[name] = objectNode({}, { prop: clone(columns) });
	}
	return wrapSpecification(options, {
		prop: {
			combined: objectNode({}, { prop: combined }),
			default: objectNode({}, { prop: defaults }),
			part: objectNode({}, { prop: fields }),
		},
	});
}

function countedSpecification(options: FinishOptions): Obj {
	const columns = (): Obj => objectNode({}, { prop: clone(options.shape.prop) });
	const row = objectNode(
		{},
		{
			prop: {
				...clone(options.shape.prop),
				ordinal: options.resolvers.field('ordinal', options.stack),
			},
		},
	);
	return wrapSpecification(
		options,
		{ prop: { combined: columns(), default: columns(), instances: { array: row } } },
		{
			concept_settings: objectNode(
				{},
				{ prop: { count: options.resolvers.field('count', options.stack) } },
			),
		},
	);
}

function specificationNode(options: FinishOptions): Obj | null {
	const { settings, shape, stack } = options;
	if (typeof settings.part === 'string' && settings.repeated === true)
		throw new Error(
			`grimoire compile: parts XOR instances — a def declares \`part:\` or \`repeated: true\`, never both (via ${stack.join(' → ')})`,
		);
	const hasColumn = Object.values(shape.prop).some(
		(value) => isPlainObject(value) && (value as Obj).$concept === 'specification',
	);
	const enabled =
		settings.is_specification === true ||
		typeof settings.part === 'string' ||
		settings.repeated === true ||
		hasColumn;
	if (!enabled) return null;
	if (typeof settings.part === 'string') return partedSpecification(options, settings.part);
	if (settings.repeated === true) return countedSpecification(options);
	return wrapSpecification(options, { prop: { combined: objectNode({}, shape) } });
}

/** Finish an assembled shape into its node: specification wrap, then part/repeated expansion, then
 *  array/map cardinality (else the plain object node). */
export function finishShape(options: FinishOptions): Obj {
	const { def, settings, shape, consumed } = options;
	// is_specification: true — this feature's props are quantity_kind COLUMNS whose VALUE is a
	// `specification` (archetypes/specification — identity + measurand + the `intervals` list of
	// rated bands), not the bare number the column's property declares. Replace each scalar field
	// with the specification archetype's shape, keeping the field's authored data (title/refs) as its
	// documentation. A field already an object node — a spec column composed in from another
	// `is_specification` feature — is skipped, never double-wrapped.
	expandSpecificationFields(options);

	// FEATURE_SPEC wrap (docs/feature-model.md "feature_spec direction"): a feature that CARRIES A
	// SPECIFICATION — marked `is_specification`, parted/counted, or composing a spec feature (whose
	// columns arrive $concept:specification-tagged) — nests its spec body {combined, default,
	// part|instances} under a `feature_spec` slot; `count` (grammar) nests under `concept_settings`.
	// A non-spec feature keeps its bare object node (cardinality / plain shape below).
	const specification = specificationNode(options);
	if (specification) return specification;

	// concept_settings cardinality: a LIST of this shape (features/refs.yaml: crosswalk rows;
	// plural slug = array, per the naming rule) or a slug-keyed RECORD of it
	// (features/vedirect_fields.yaml). Intrinsic to the feature, never a use-site override.
	if (settings.is_array === true) return { ...dataOf(def, consumed), array: objectNode({}, shape) };
	if (settings.map === true) return { ...dataOf(def, consumed), map: objectNode({}, shape) };

	return objectNode(dataOf(def, consumed), shape);
}
