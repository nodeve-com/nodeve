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
import { isPlainObject } from 'remeda';

// Identifiers the generated modules already bind — TypeBox's `Type`/`TSchema` and the TS built-ins the
// type emitter names (`Record`, `Array`). A concept slug whose PascalCase lands on one gets a `_` so its
// `<Name>` type / `<Name>Schema` const can't shadow them. Applied at pascal() so exports AND every
// reference stay consistent (both sides run through here).
const RESERVED = new Set(['Type', 'TSchema', 'Record', 'Array', 'String', 'Static']);
export const pascal = (slug: string): string => {
	const p = slug.split('_').map((s) => s[0]!.toUpperCase() + s.slice(1)).join('');
	return RESERVED.has(p) ? `${p}_` : p;
};

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
	if (typeof node.$ref === 'string') return `${pascal(refName(node.$ref))}Schema`;
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
	if (typeof node.$ref === 'string') return pascal(refName(node.$ref));
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
	/** The referentialized DATA tree (labels/refs/ui + `$ref` slots) — emitted as the module's
	 *  `export default` so the .ts twin carries everything the sibling .json does, not just the schema. */
	data?: unknown;
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

/** The local const a data `$ref` composes — the sibling module's default export, imported here. */
const dataLocal = (name: string): string => `${pascal(name)}Data`;

/** Every distinct `$ref` slot a data tree composes, so the emit imports each sibling default once. */
function collectDataRefs(node: unknown, fromLayer: string, out: Map<string, { name: string; layer: string }>): void {
	if (Array.isArray(node)) return void node.forEach((n) => collectDataRefs(n, fromLayer, out));
	if (!isPlainObject(node)) return;
	if (typeof node.$ref === 'string') out.set(node.$ref, parseDataRef(node.$ref, fromLayer));
	for (const v of Object.values(node)) collectDataRefs(v, fromLayer, out);
}

/** One data node as its precise TS TYPE — the twin of `dataLiteral`. A `$ref` slot is the sibling's
 *  exported `<Name>DataT` (by name, so the alias stays small and never re-expands → no TS7056); its
 *  overlay `Omit`s the overridden keys off the base and intersects the local ones. Annotating the
 *  `export default` with this keeps it precisely typed without the compiler serializing a giant literal. */
function dataType(node: unknown, fromLayer: string): string {
	if (Array.isArray(node)) return node.length === 0 ? 'readonly []' : `readonly [${node.map((c) => dataType(c, fromLayer)).join(', ')}]`;
	if (isPlainObject(node)) {
		if (typeof node.$ref === 'string') {
			const base = `${pascal(parseDataRef(node.$ref, fromLayer).name)}DataT`;
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

/** One data node as a TS literal. A `$ref` slot renders as the imported sibling default (`AcPhaseData`),
 *  its authored overlay (title/refs/…) spread on top so the shared shape lives once. */
function dataLiteral(node: unknown, indent: string, fromLayer: string): string {
	const inner = indent + '\t';
	if (Array.isArray(node)) {
		if (node.length === 0) return '[]';
		return `[\n${node.map((c) => inner + dataLiteral(c, inner, fromLayer)).join(',\n')}\n${indent}]`;
	}
	if (isPlainObject(node)) {
		if (typeof node.$ref === 'string') {
			const base = dataLocal(parseDataRef(node.$ref, fromLayer).name);
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

/** One concept's generated/<layer>/<name>.ts: the live TypeBox schema VALUE (the validator + the
 *  JSON-Schema contract in one object) and its camelCase `Static` type. No .json is imported — the
 *  schema is code, so the runtime path stays fs-free. Composed concept slots import their sibling
 *  `<Name>Schema` const rather than restating the shape. */
export function renderConceptModule({ name, schema, layer, imports = [], data }: EmittedConcept): string {
	const Type = pascal(name);
	// Merge the schema-composed deps (need `{ <Name>Schema, type <Name> }`) with the data-composed
	// `$ref` slots (need the sibling `default`, imported as `<Name>Data`) — one import line per module.
	const merged = new Map<string, { name: string; layer: string; schema: boolean; data: boolean }>();
	for (const d of imports) merged.set(d.name, { ...d, schema: true, data: merged.get(d.name)?.data ?? false });
	const refByPath = new Map<string, { name: string; layer: string }>();
	if (data !== undefined) collectDataRefs(data, layer, refByPath);
	for (const d of refByPath.values()) {
		const e = merged.get(d.name);
		if (e) e.data = true;
		else merged.set(d.name, { ...d, schema: false, data: true });
	}
	const deps = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
	const importLine = (d: { name: string; layer: string; schema: boolean; data: boolean }): string => {
		const P = pascal(d.name);
		// Composed slot needs the sibling default VALUE (`<P>Data`) + its data TYPE (`<P>DataT`); a
		// schema-composed slot needs `<P>Schema` + parsed type `<P>`. `<P>Data`/`<P>DataT` never collide.
		const named = [d.schema ? `${P}Schema` : '', d.schema ? `type ${P}` : '', d.data ? `type ${P}DataT` : ''].filter(Boolean).join(', ');
		const parts = [d.data ? `${P}Data` : '', named ? `{ ${named} }` : ''].filter(Boolean).join(', ');
		return `import ${parts} from '${importPath(layer, d)}';`;
	};
	return [
		`// GENERATED by \`pnpm generate\` from concepts/${layer}/ via kit/compile.ts +`,
		'// kit/emit-types.ts. Do not edit by hand — edit the YAML and regenerate. The camelCase',
		'// TypeBox schema (@nodeve/schema-case projection of the draft-07; `x-key-map` carries the',
		'// snake aliases); `Value.Check(<Name>Schema, …)` validates data already renamed at the parse',
		'// edge (src/parse.ts). The `export default` is the AUTHORED data tree (labels/refs/ui) — the',
		"// sibling .json's content, camelCase keys (snake never enters a .ts emit); composed slots spread",
		'// their sibling `<Name>Data` so a shape lives once.',
		'',
		"import { type TSchema, Type } from '@sinclair/typebox';",
		...deps.map(importLine),
		'',
		// `: TSchema` — the schema VALUE composes sibling consts, whose inferred TypeBox type re-expands
		// the whole graph (TS7056 on a big device). The annotation keeps the const opaque; the precise
		// camelCase surface is the separately-composed `${Type}` type below, not `Static<typeof>`.
		`export const ${Type}Schema: TSchema = ${typeBox(schema)};`,
		'',
		`export type ${Type} = ${tsType(schema)};`,
		'',
		// The `export default` is the DATA tree, annotated with its own `${Type}DataT` so the composed
		// literal is precisely typed WITHOUT the compiler serializing a giant inferred type (TS7056).
		...(data !== undefined
			? [
					`export type ${Type}DataT = ${dataType(data, layer)};`,
					'',
					`const _data: ${Type}DataT = ${dataLiteral(data, '', layer)};`,
					'export default _data;',
					'',
				]
			: []),
	].join('\n');
}

// The aggregate emits (generated/index.ts, generated/archetype-index.ts) live in kit/emit-index.ts.
