// Draft-07 → TypeBox emitter: transcribes each concept's projected validation schema (kit/project.ts,
// the same object that lands as the sibling <name>.schema.json) into a per-concept generated module —
// a live `Type.*` schema VALUE plus its `Camelize<Static<>>` type. The schema is code, not a loaded
// .json: the runtime path never touches fs (this package sometimes runs serverless). One source
// (the projected draft-07) → two serializations (renderJson→.schema.json, this→.ts), so they can't drift.
// Tree-driven: the caller hands it every concept the layers define; nothing here names one.
// BUILD-ONLY: generate.ts calls this; runtime imports the emitted generated/ modules.
// Keys stay snake_case here (the schema IS the snake_case wire contract); the `Camelize<Static<>>`
// type is the camelCase surface consumers code against, humped once at the parse boundary.

import type { Obj } from './concept-sources.ts';

// Identifiers the generated modules already bind — TypeBox's `Type`/`TSchema` and the TS built-ins the
// type emitter names (`Record`, `Array`). A concept slug whose PascalCase lands on one gets a `_` so its
// `<Name>` type / `<Name>Schema` const can't shadow them. Applied at pascal() so exports AND every
// reference stay consistent (both sides run through here).
const RESERVED = new Set(['Type', 'TSchema', 'Record', 'Array', 'String', 'Static']);
const pascal = (slug: string): string => {
	const p = slug.split('_').map((s) => s[0]!.toUpperCase() + s.slice(1)).join('');
	return RESERVED.has(p) ? `${p}_` : p;
};

// The structural keywords the emitter consumes as `Type.*` shape; everything else a node states is
// a constraint/annotation (minLength, pattern, minimum, minItems, x-env-var, …) that rides into the
// constructor's options object verbatim.
const STRUCTURAL = new Set(['type', 'properties', 'required', 'items', 'anyOf', 'enum', 'const', 'additionalProperties']);

/** The non-structural keywords as a TypeBox options-object literal (`{ … }`), or null when none —
 *  so single-arg constructors stay bare. Keys sorted for deterministic output. `extra` overlays
 *  keywords the caller reintroduces (e.g. a closed object's `additionalProperties: false`). */
function optionsLiteral(node: Obj, extra?: Obj): string | null {
	const opts: Obj = {};
	for (const key of Object.keys(node).sort()) if (!STRUCTURAL.has(key)) opts[key] = node[key];
	if (extra) Object.assign(opts, extra);
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
	if (Array.isArray(node.anyOf)) return `Type.Union([${(node.anyOf as Obj[]).map(typeBox).join(', ')}]${tail(optionsLiteral(node))})`;
	if (Array.isArray(node.enum)) {
		const literals = node.enum.map((v) => `Type.Literal(${JSON.stringify(v)})`);
		return literals.length === 1 ? literals[0]! : `Type.Union([${literals.join(', ')}]${tail(optionsLiteral(node))})`;
	}
	if ('const' in node) return `Type.Literal(${JSON.stringify(node.const)}${tail(optionsLiteral(node))})`;
	switch (node.type) {
		case 'object': {
			const props = node.properties as Record<string, Obj> | undefined;
			const closed = node.additionalProperties === false ? { additionalProperties: false } : undefined;
			if (props && Object.keys(props).length > 0) {
				const required = new Set((node.required as string[] | undefined) ?? []);
				const fields = Object.entries(props).map(([key, sub]) => {
					const t = typeBox(sub);
					return `${JSON.stringify(key)}: ${required.has(key) ? t : `Type.Optional(${t})`}`;
				});
				return `Type.Object({ ${fields.join(', ')} }${tail(optionsLiteral(node, closed))})`;
			}
			// A slug-keyed record (map node): additionalProperties carries the value schema.
			if (node.additionalProperties && typeof node.additionalProperties === 'object')
				return `Type.Record(Type.String(), ${typeBox(node.additionalProperties as Obj)}${tail(optionsLiteral(node))})`;
			return `Type.Object({}${tail(optionsLiteral(node, closed))})`;
		}
		case 'array':
			return `Type.Array(${node.items ? typeBox(node.items as Obj) : 'Type.Unknown()'}${tail(optionsLiteral(node))})`;
		case 'integer':
			return `Type.Integer(${optionsLiteral(node) ?? ''})`;
		case 'number':
			return `Type.Number(${optionsLiteral(node) ?? ''})`;
		case 'boolean':
			return `Type.Boolean(${optionsLiteral(node) ?? ''})`;
		case 'string':
			return `Type.String(${optionsLiteral(node) ?? ''})`;
		default:
			// A slot placeholder or annotation-only node — no value contract to pin.
			return 'Type.Unknown()';
	}
}

/** snake_case → camelCase, matching remeda-humps `Camelize` (the surface consumers code against). */
const camel = (k: string): string => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

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
				const fields = Object.entries(props).map(([k, sub]) => `${JSON.stringify(camel(k))}${required.has(k) ? '' : '?'}: ${tsType(sub)}`);
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
}

/** The relative import path from one concept module to another (both under generated/<layer>/). */
const importPath = (from: string, dep: { name: string; layer: string }): string =>
	dep.layer === from ? `./${dep.name}.ts` : `../${dep.layer}/${dep.name}.ts`;

/** One concept's generated/<layer>/<name>.ts: the live TypeBox schema VALUE (the validator + the
 *  JSON-Schema contract in one object) and its camelCase `Static` type. No .json is imported — the
 *  schema is code, so the runtime path stays fs-free. Composed concept slots import their sibling
 *  `<Name>Schema` const rather than restating the shape. */
export function renderConceptModule({ name, schema, layer, imports = [] }: EmittedConcept): string {
	const Type = pascal(name);
	const deps = [...new Map(imports.map((d) => [d.name, d])).values()].sort((a, b) => a.name.localeCompare(b.name));
	return [
		`// GENERATED by \`pnpm generate\` from concepts/${layer}/ via kit/compile.ts +`,
		'// kit/emit-types.ts. Do not edit by hand — edit the YAML and regenerate. The snake_case',
		'// TypeBox schema transcribed from the compiled draft-07 projection (its own <name>.schema.json);',
		'// `Value.Check(<Name>Schema, …)` validates, the camelCase type is the surface consumers code',
		'// against. Composed concept slots reference their sibling `<Name>Schema` const / type by name.',
		'',
		"import { type TSchema, Type } from '@sinclair/typebox';",
		...deps.map((d) => `import { ${pascal(d.name)}Schema, type ${pascal(d.name)} } from '${importPath(layer, d)}';`),
		'',
		// `: TSchema` — the schema VALUE composes sibling consts, whose inferred TypeBox type re-expands
		// the whole graph (TS7056 on a big device). The annotation keeps the const opaque; the precise
		// camelCase surface is the separately-composed `${Type}` type below, not `Static<typeof>`.
		`export const ${Type}Schema: TSchema = ${typeBox(schema)};`,
		'',
		`export type ${Type} = ${tsType(schema)};`,
		'',
	].join('\n');
}

/** The generated/index.ts aggregate: the runtime schema map + slug→type dict, built from
 *  per-concept imports. All imports are code (no `with { type: 'json' }`) — fs-free at runtime.
 *  Single-concept access goes to that concept's own module, not through here. */
export function renderConceptsIndex(concepts: Array<{ name: string; layer: string }>): string {
	const sorted = [...concepts].sort((a, b) => a.name.localeCompare(b.name));
	const tsPath = (c: { name: string; layer: string }): string => `./${c.layer}/${c.name}.ts`;
	return [
		'// GENERATED by `pnpm generate` — the aggregate over every per-concept module.',
		'// Do not edit by hand — edit the YAML and regenerate. This builds the runtime schema map and',
		"// slug→type dict; for a single concept import its own module. All imports are code, no JSON.",
		'',
		"import type { TSchema } from '@sinclair/typebox';",
		sorted.map((c) => `import { ${pascal(c.name)}Schema, type ${pascal(c.name)} } from '${tsPath(c)}';`).join('\n'),
		'',
		'/** Every compiled concept schema (live TypeBox), keyed by slug — the runtime source (no fs).',
		' *  Explicitly typed `Record<keyof ConceptTypes, TSchema>` — the inferred union is too large for',
		' *  TS to serialize (TS7056); per-concept modules keep their precise schema type. */',
		`export const conceptSchemas: Record<keyof ConceptTypes, TSchema> = {\n${sorted.map((c) => `\t${c.name}: ${pascal(c.name)}Schema,`).join('\n')}\n};`,
		'',
		'/** slug → parsed (camelCase) type — what a generic parse over `conceptSchemas` keys on. */',
		`export interface ConceptTypes {\n${sorted.map((c) => `\t${c.name}: ${pascal(c.name)};`).join('\n')}\n}`,
		'',
	].join('\n');
}
