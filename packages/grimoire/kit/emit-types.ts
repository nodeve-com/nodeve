// Draft-07 → TypeBox emitter: transcribes each concept's projected validation schema (kit/project.ts,
// the same object that lands as the sibling <name>.schema.json) into a per-concept generated module —
// a live `Type.*` schema VALUE plus its camelCase type. The schema is code, not a loaded
// .json: the runtime path never touches fs (this package sometimes runs serverless). One source
// (the projected draft-07) → two serializations (renderJson→.schema.json, this→.ts), so they can't drift.
// Tree-driven: the caller hands it every concept the layers define; nothing here names one.
// BUILD-ONLY: generate.ts calls this; runtime imports the emitted generated/ modules.
// TS is camelCase wall-to-wall (docs/typebox-vs-zod.md): the caller hands this a schema already
// camelized by @nodeve/schema-case — keys camel, snake→camel `x-key-map` stamped per object node
// (it rides into the options literal like any other annotation; src/parse.ts renames by it at the
// parse edge, before validation). This module only transcribes; it never respells anything.

import { type Obj } from '../src/concept-sources.ts';
import { isPlainObject, toCamelCase } from 'remeda';

// Identifiers the generated modules already bind — TypeBox's `Type`/`TSchema` and the TS built-ins the
// type emitter names (`Record`, `Array`). A concept slug whose PascalCase lands on one gets a `_` so its
// `<Name>` type / `<Name>Schema` const can't shadow them. Applied at pascal() so exports AND every
// reference stay consistent (both sides run through here).
const RESERVED = new Set(['Type', 'TSchema', 'Record', 'Array', 'String', 'Static']);
export const pascal = (slug: string): string => {
	const p = slug.split('_').map((s) => s[0]!.toUpperCase() + s.slice(1)).join('');
	return RESERVED.has(p) ? `${p}_` : p;
};

/** The local binding a sibling module's namespace import gets (`import * as ac_phase → acPhase_`).
 *  Trailing `_` keeps it off every other binding class: data keys never end in `_`, types are Pascal,
 *  the module's own exports are `schema`/field names. Shared by every emit that references a sibling. */
export const nsLocal = (slug: string): string => `${toCamelCase(slug)}_`;

/** The keywords a node still states once its branch has consumed the shape ones, as a TypeBox
 *  options-object literal (`{ … }`), or null when none — so single-arg constructors stay bare. These
 *  are the constraints/annotations (minLength, pattern, minimum, minItems, x-env-var, …) that ride
 *  into the constructor verbatim. `rest` is what the branch didn't read; `extra` overlays keywords the
 *  caller reintroduces (e.g. a closed object's `additionalProperties: false`). Keys sorted, deterministic. */
function optionsLiteral(rest: Obj, extra?: Obj): string | null {
	const merged: Obj = extra ? { ...rest, ...extra } : rest;
	const opts: Obj = {};
	for (const key of Object.keys(merged).sort()) opts[key] = merged[key];
	return Object.keys(opts).length > 0 ? JSON.stringify(opts) : null;
}

/** Append an options literal as a trailing constructor arg (`, { … }`), or '' when there are none. */
const tail = (lit: string | null): string => (lit ? `, ${lit}` : '');

/** The concept a `$ref` names — bare (`intervals`) as kit/project.ts emits it, or the `#/$defs/…`
 *  JSON-pointer form. Either way the last path segment is the concept slug. */
const refName = (ref: string): string => ref.split('/').pop()!;

/** One draft-07 schema node as a `Type.*` expression. Mirrors kit/project.ts's node forms in reverse.
 *  A `$ref` node references its concept's sibling `<Name>Schema` const (imported) — composed, not
 *  restated, so a 301× shape appears once and TS keeps the inferred type small. */
function typeBox(node: Obj): string {
	if (typeof node.$ref === 'string') return `${nsLocal(refName(node.$ref))}.schema`;
	if (Array.isArray(node.anyOf)) {
		const { anyOf, ...rest } = node;
		return `Type.Union([${(anyOf as Obj[]).map(typeBox).join(', ')}]${tail(optionsLiteral(rest))})`;
	}
	if (Array.isArray(node.enum)) {
		const { enum: members, ...rest } = node;
		const literals = (members as unknown[]).map((v) => `Type.Literal(${JSON.stringify(v)})`);
		return literals.length === 1 ? literals[0]! : `Type.Union([${literals.join(', ')}]${tail(optionsLiteral(rest))})`;
	}
	if ('const' in node) {
		const { const: literal, ...rest } = node;
		return `Type.Literal(${JSON.stringify(literal)}${tail(optionsLiteral(rest))})`;
	}
	switch (node.type) {
		case 'object': {
			const { type: _t, properties, required, additionalProperties, ...rest } = node;
			const props = properties as Record<string, Obj> | undefined;
			const closed = additionalProperties === false ? { additionalProperties: false } : undefined;
			if (props && Object.keys(props).length > 0) {
				const req = new Set((required as string[] | undefined) ?? []);
				const fields = Object.entries(props).map(([key, sub]) => {
					const t = typeBox(sub);
					return `${JSON.stringify(key)}: ${req.has(key) ? t : `Type.Optional(${t})`}`;
				});
				return `Type.Object({ ${fields.join(', ')} }${tail(optionsLiteral(rest, closed))})`;
			}
			// A slug-keyed record (map node): additionalProperties carries the value schema.
			if (additionalProperties && typeof additionalProperties === 'object')
				return `Type.Record(Type.String(), ${typeBox(additionalProperties as Obj)}${tail(optionsLiteral(rest))})`;
			return `Type.Object({}${tail(optionsLiteral(rest, closed))})`;
		}
		case 'array': {
			const { type: _t, items, ...rest } = node;
			return `Type.Array(${items ? typeBox(items as Obj) : 'Type.Unknown()'}${tail(optionsLiteral(rest))})`;
		}
		case 'integer':
		case 'number':
		case 'boolean':
		case 'string': {
			const { type, ...rest } = node;
			const ctor = (type as string)[0]!.toUpperCase() + (type as string).slice(1);
			return `Type.${ctor}(${optionsLiteral(rest) ?? ''})`;
		}
		default:
			// A slot placeholder or annotation-only node — no value contract to pin.
			return 'Type.Unknown()';
	}
}

/** One draft-07 node as its camelCase TypeScript type. The COMPOSED counterpart of `typeBox`: a
 *  `$ref` becomes the sibling concept's exported TYPE (imported), so a concept's type references its
 *  parts by name instead of re-expanding them — the whole reference graph never materialises in one
 *  type (which is what tips `Static<>` over TS7056 on a big device). */
function tsType(node: Obj): string {
	if (typeof node.$ref === 'string') {
		const name = refName(node.$ref);
		return `${nsLocal(name)}.${pascal(name)}`;
	}
	if (Array.isArray(node.anyOf)) return (node.anyOf as Obj[]).map(tsType).join(' | ') || 'never';
	if (Array.isArray(node.enum)) return (node.enum as unknown[]).map((v) => JSON.stringify(v)).join(' | ');
	if ('const' in node) return JSON.stringify(node.const);
	switch (node.type) {
		case 'object': {
			const props = node.properties as Record<string, Obj> | undefined;
			if (props && Object.keys(props).length > 0) {
				const required = new Set((node.required as string[] | undefined) ?? []);
				const fields = Object.entries(props).map(([k, sub]) => `${JSON.stringify(k)}${required.has(k) ? '' : '?'}: ${tsType(sub)}`);
				return `{ ${fields.join('; ')} }`;
			}
			if (node.additionalProperties && typeof node.additionalProperties === 'object') return `Record<string, ${tsType(node.additionalProperties as Obj)}>`;
			return 'Record<string, never>';
		}
		case 'array':
			return `Array<${node.items ? tsType(node.items as Obj) : 'unknown'}>`;
		case 'integer':
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'string':
			return 'string';
		default:
			return 'unknown';
	}
}

export interface EmittedConcept {
	name: string;
	schema: Obj;
	layer: string;
	/** Direct concept refs this module composes (`$ref` slots) — imported as sibling `<Name>Schema`. */
	imports?: Array<{ name: string; layer: string }>;
	/** The referentialized DATA tree (labels/refs/ui + `$ref` slots) — emitted as one named export
	 *  per top-level field so the .ts twin carries everything the sibling .json does, not just the schema. */
	data?: unknown;
	/** A concept's top-level data FIELD names (its own keys ∪ its composed base's, `$ref`-chased) —
	 *  needed when `data` itself composes a base (`$ref` at the top): the emit projects the base's
	 *  fields explicitly instead of spreading its namespace (which would drag in the BASE's `schema`). */
	fieldsOf?: (name: string) => string[];
}

/** The relative import path from one concept module to another (both under generated/<layer>/). */
const importPath = (from: string, dep: { name: string; layer: string }): string =>
	dep.layer === from ? `./${dep.name}.ts` : `../${dep.layer}/${dep.name}.ts`;

/** A data-tree `$ref` (`../features/ac_phase.json` | `./x.json`) → its concept slug + layer. */
function parseDataRef(ref: string, fromLayer: string): { name: string; layer: string } {
	const name = refName(ref).replace(/\.json$/, '');
	const m = /\.\.\/([^/]+)\//.exec(ref);
	return { name, layer: m ? m[1]! : fromLayer };
}


/** Every distinct `$ref` slot a data tree composes, so the emit imports each sibling default once. */
function collectDataRefs(node: unknown, fromLayer: string, out: Map<string, { name: string; layer: string }>): void {
	if (Array.isArray(node)) return void node.forEach((n) => collectDataRefs(n, fromLayer, out));
	if (!isPlainObject(node)) return;
	if (typeof node.$ref === 'string') out.set(node.$ref, parseDataRef(node.$ref, fromLayer));
	for (const v of Object.values(node)) collectDataRefs(v, fromLayer, out);
}

/** One data node as its precise TS TYPE — the twin of `dataLiteral`. A `$ref` slot is `typeof` the
 *  sibling's namespace (a small named alias that never re-expands → no TS7056); its overlay `Omit`s
 *  the overridden keys off the base and intersects the local ones. Annotating `_data` with this
 *  keeps it precisely typed without the compiler serializing a giant literal. */
function dataType(node: unknown, fromLayer: string): string {
	if (Array.isArray(node)) return node.length === 0 ? 'readonly []' : `readonly [${node.map((c) => dataType(c, fromLayer)).join(', ')}]`;
	if (isPlainObject(node)) {
		if (typeof node.$ref === 'string') {
			const base = `typeof ${nsLocal(parseDataRef(node.$ref, fromLayer).name)}`;
			const overlay = Object.keys(node).filter((k) => k !== '$ref').sort();
			if (overlay.length === 0) return base;
			const omit = overlay.map((k) => JSON.stringify(k)).join(' | ');
			const fields = overlay.map((k) => `readonly ${JSON.stringify(k)}: ${dataType(node[k], fromLayer)}`);
			return `Omit<${base}, ${omit}> & { ${fields.join('; ')} }`;
		}
		const keys = Object.keys(node).sort();
		if (keys.length === 0) return 'Record<string, never>';
		return `{ ${keys.map((k) => `readonly ${JSON.stringify(k)}: ${dataType(node[k], fromLayer)}`).join('; ')} }`;
	}
	return JSON.stringify(node);
}

/** One data node as a TS literal. A `$ref` slot renders as the sibling's spread namespace
 *  (`...acPhase_` — the def node: fields + `schema`), its authored overlay (title/refs/…) spread on
 *  top so the shared shape lives once. */
function dataLiteral(node: unknown, indent: string, fromLayer: string): string {
	const inner = indent + '\t';
	if (Array.isArray(node)) {
		if (node.length === 0) return '[]';
		return `[\n${node.map((c) => inner + dataLiteral(c, inner, fromLayer)).join(',\n')}\n${indent}]`;
	}
	if (isPlainObject(node)) {
		if (typeof node.$ref === 'string') {
			const base = nsLocal(parseDataRef(node.$ref, fromLayer).name);
			const overlay = Object.keys(node).filter((k) => k !== '$ref').sort();
			if (overlay.length === 0) return base;
			const fields = overlay.map((k) => `${inner}${JSON.stringify(k)}: ${dataLiteral(node[k], inner, fromLayer)}`);
			return `{\n${inner}...${base},\n${fields.join(',\n')}\n${indent}}`;
		}
		const keys = Object.keys(node).sort();
		if (keys.length === 0) return '{}';
		return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${dataLiteral(node[k], inner, fromLayer)}`).join(',\n')}\n${indent}}`;
	}
	return JSON.stringify(node);
}

/** One concept's generated/<layer>/<name>.ts — the module IS the def node: each top-level authored
 *  field a named export (`title`, `description`, `prop`, …) beside the live TypeBox `schema` and the
 *  parsed-instance `type <Name>`. `import * as x` is the whole node; `import { title, schema }` picks
 *  fields. No .json is imported — the schema is code, so the runtime path stays fs-free. Composed
 *  slots reference/spread the sibling's namespace rather than restating the shape. */
export function renderConceptModule({ name, schema, layer, imports = [], data, fieldsOf }: EmittedConcept): string {
	const Type = pascal(name);
	// One namespace import per referenced sibling — serves schema refs (`x_.schema`), type refs
	// (`x_.X`), and data spreads (`...x_`) alike.
	const depByName = new Map<string, { name: string; layer: string }>();
	for (const d of imports) depByName.set(d.name, d);
	const refByPath = new Map<string, { name: string; layer: string }>();
	if (data !== undefined) collectDataRefs(data, layer, refByPath);
	for (const d of refByPath.values()) depByName.set(d.name, { name: d.name, layer: d.layer });
	const sorted = [...depByName.values()].sort((a, b) => a.name.localeCompare(b.name));
	// The top-level field set + its literal/type. A top-level `$ref` (concept_settings.compose)
	// projects the base's fields EXPLICITLY (never `...ns_` — that would drag in the base's `schema`),
	// authored overlay keys winning; a plain top level renders as-is.
	const tree = isPlainObject(data) ? data : undefined;
	const baseRef = typeof tree?.$ref === 'string' ? parseDataRef(tree.$ref, layer) : undefined;
	const overlay = tree ? Object.keys(tree).filter((k) => k !== '$ref').sort() : [];
	const inherited = baseRef ? fieldsOf!(baseRef.name).filter((f) => !overlay.includes(f)).sort() : [];
	const fields = [...inherited, ...overlay].sort();
	const ns = baseRef ? nsLocal(baseRef.name) : '';
	const dataLines = tree && fields.length > 0
		? [
				`type DataT = ${
					baseRef
						? `{ ${[
								...inherited.map((f) => `readonly ${JSON.stringify(f)}: (typeof ${ns})[${JSON.stringify(f)}]`),
								...overlay.map((f) => `readonly ${JSON.stringify(f)}: ${dataType(tree[f], layer)}`),
							].join('; ')} }`
						: dataType(tree, layer)
				};`,
				'',
				`const _data: DataT = ${
					baseRef
						? `{\n${[
								...inherited.map((f) => `\t${JSON.stringify(f)}: ${ns}[${JSON.stringify(f)}]`),
								...overlay.map((f) => `\t${JSON.stringify(f)}: ${dataLiteral(tree[f], '\t', layer)}`),
							].join(',\n')}\n}`
						: dataLiteral(tree, '', layer)
				};`,
				`export const { ${fields.join(', ')} } = _data;`,
				'',
			]
		: [];
	return [
		`// GENERATED by \`pnpm generate\` from concepts/${layer}/ via kit/compile.ts +`,
		'// kit/emit-types.ts. Do not edit by hand — edit the YAML and regenerate. The module IS the',
		'// def node: the authored fields (labels/refs/ui) as named exports beside the live camelCase',
		'// TypeBox `schema` (@nodeve/schema-case projection of the draft-07; `x-key-map` carries the',
		'// snake aliases — `Value.Check(schema, …)` validates data renamed at the parse edge,',
		"// src/parse.ts) and the parsed-instance type. Composed slots spread the sibling's namespace",
		'// (fields + `schema`) so a shape lives once; snake never enters a .ts emit.',
		'',
		"import { type TSchema, Type } from '@sinclair/typebox';",
		...sorted.map((d) => `import * as ${nsLocal(d.name)} from '${importPath(layer, d)}';`),
		'',
		// `: TSchema` — the schema VALUE composes sibling consts, whose inferred TypeBox type re-expands
		// the whole graph (TS7056 on a big device). The annotation keeps the const opaque; the precise
		// camelCase surface is the separately-composed `${Type}` type below, not `Static<typeof>`.
		`export const schema: TSchema = ${typeBox(schema)};`,
		'',
		`export type ${Type} = ${tsType(schema)};`,
		'',
		// The authored data tree, annotated with its own `DataT` so the composed literal is precisely
		// typed WITHOUT the compiler serializing a giant inferred type (TS7056), then destructured to
		// one named export per top-level field.
		...dataLines,
	].join('\n');
}

// The aggregate emits (generated/index.ts, generated/archetype-index.ts) live in kit/emit-index.ts.
