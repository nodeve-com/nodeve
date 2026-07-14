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
import { nsLocal, pascal, refName, tsType, typeBox } from './emit-type-box.ts';

export { nsLocal, pascal } from './emit-type-box.ts';

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
function collectDataRefs(
	node: unknown,
	fromLayer: string,
	out: Map<string, { name: string; layer: string }>,
): void {
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
	if (Array.isArray(node))
		return node.length === 0
			? 'readonly []'
			: `readonly [${node.map((c) => dataType(c, fromLayer)).join(', ')}]`;
	if (isPlainObject(node)) {
		if (typeof node.$ref === 'string') {
			const base = `typeof ${nsLocal(parseDataRef(node.$ref, fromLayer).name)}`;
			const overlay = Object.keys(node)
				.filter((k) => k !== '$ref')
				.sort();
			if (overlay.length === 0) return base;
			const omit = overlay.map((k) => JSON.stringify(k)).join(' | ');
			const fields = overlay.map(
				(k) => `readonly ${JSON.stringify(k)}: ${dataType(node[k], fromLayer)}`,
			);
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
			const overlay = Object.keys(node)
				.filter((k) => k !== '$ref')
				.sort();
			if (overlay.length === 0) return base;
			const fields = overlay.map(
				(k) => `${inner}${JSON.stringify(k)}: ${dataLiteral(node[k], inner, fromLayer)}`,
			);
			return `{\n${inner}...${base},\n${fields.join(',\n')}\n${indent}}`;
		}
		const keys = Object.keys(node).sort();
		if (keys.length === 0) return '{}';
		return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${dataLiteral(node[k], inner, fromLayer)}`).join(',\n')}\n${indent}}`;
	}
	return JSON.stringify(node);
}

type ComposedInput = {
	tree: Obj;
	layer: string;
	baseName: string;
	inherited: string[];
	overlay: string[];
};

/** Format one composed shape's members: `inherited` reference the base namespace, `overlay` render inline. */
type ComposedFmt = {
	inherited: (namespace: string, field: string) => string;
	overlay: (tree: Obj, layer: string, field: string) => string;
	wrap: (members: string[]) => string;
};

function composedMembers(options: ComposedInput, fmt: ComposedFmt): string {
	const { tree, layer, baseName, inherited, overlay } = options;
	const namespace = nsLocal(baseName);
	return fmt.wrap([
		...inherited.map((field) => fmt.inherited(namespace, field)),
		...overlay.map((field) => fmt.overlay(tree, layer, field)),
	]);
}

const composedDataType = (options: ComposedInput): string =>
	composedMembers(options, {
		inherited: (ns, f) => `readonly ${JSON.stringify(f)}: (typeof ${ns})[${JSON.stringify(f)}]`,
		overlay: (tree, layer, f) => `readonly ${JSON.stringify(f)}: ${dataType(tree[f], layer)}`,
		wrap: (m) => `{ ${m.join('; ')} }`,
	});

const composedDataLiteral = (options: ComposedInput): string =>
	composedMembers(options, {
		inherited: (ns, f) => `\t${JSON.stringify(f)}: ${ns}[${JSON.stringify(f)}]`,
		overlay: (tree, layer, f) => `\t${JSON.stringify(f)}: ${dataLiteral(tree[f], '\t', layer)}`,
		wrap: (m) => `{\n${m.join(',\n')}\n}`,
	});

function conceptDataLines(
	tree: Obj | undefined,
	layer: string,
	fieldsOf: ((name: string) => string[]) | undefined,
): string[] {
	if (!tree) return [];
	const baseRef = typeof tree.$ref === 'string' ? parseDataRef(tree.$ref, layer) : undefined;
	const overlay = Object.keys(tree)
		.filter((key) => key !== '$ref')
		.sort();
	const inherited = baseRef
		? fieldsOf!(baseRef.name)
				.filter((field) => !overlay.includes(field))
				.sort()
		: [];
	const fields = [...inherited, ...overlay].sort();
	if (fields.length === 0) return [];
	const type = baseRef
		? composedDataType({ tree, layer, baseName: baseRef.name, inherited, overlay })
		: dataType(tree, layer);
	const literal = baseRef
		? composedDataLiteral({ tree, layer, baseName: baseRef.name, inherited, overlay })
		: dataLiteral(tree, '', layer);
	return [
		`type DataT = ${type};`,
		'',
		`const _data: DataT = ${literal};`,
		`export const { ${fields.join(', ')} } = _data;`,
		'',
	];
}

/** One concept's generated/<layer>/<name>.ts — the module IS the def node: each top-level authored
 *  field a named export (`title`, `description`, `prop`, …) beside the live TypeBox `schema` and the
 *  parsed-instance `type <Name>`. `import * as x` is the whole node; `import { title, schema }` picks
 *  fields. No .json is imported — the schema is code, so the runtime path stays fs-free. Composed
 *  slots reference/spread the sibling's namespace rather than restating the shape. */
export function renderConceptModule({
	name,
	schema,
	layer,
	imports = [],
	data,
	fieldsOf,
}: EmittedConcept): string {
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
	const dataLines = conceptDataLines(tree, layer, fieldsOf);
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
		`export type ${pascal(name)} = ${tsType(schema)};`,
		'',
		// The authored data tree, annotated with its own `DataT` so the composed literal is precisely
		// typed WITHOUT the compiler serializing a giant inferred type (TS7056), then destructured to
		// one named export per top-level field.
		...dataLines,
	].join('\n');
}

// The aggregate emits (generated/index.ts, generated/archetype-index.ts) live in kit/emit-index.ts.
