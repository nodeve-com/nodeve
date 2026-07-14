// Draft-07 schema node → TypeBox `Type.*` value + its camelCase TS type. The pure node-transcription
// half of the emitter; kit/emit-types.ts composes these into per-concept modules. See that file's header
// for the one-source→two-serializations contract. This module only transcribes; it never respells a key.

import { type Obj } from '../src/concept-sources.ts';
import { omit, toCamelCase } from 'remeda';

// Identifiers the generated modules already bind — TypeBox's `Type`/`TSchema` and the TS built-ins the
// type emitter names (`Record`, `Array`). A concept slug whose PascalCase lands on one gets a `_` so its
// `<Name>` type / `<Name>Schema` const can't shadow them. Applied at pascal() so exports AND every
// reference stay consistent (both sides run through here).
const RESERVED = new Set(['Type', 'TSchema', 'Record', 'Array', 'String', 'Static']);
export const pascal = (slug: string): string => {
	const p = slug
		.split('_')
		.map((s) => s[0]!.toUpperCase() + s.slice(1))
		.join('');
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
export const refName = (ref: string): string => ref.split('/').pop()!;

function objectTypeBox(node: Obj): string {
	const { properties, required, additionalProperties } = node;
	const rest = omit(node, ['type', 'properties', 'required', 'additionalProperties']);
	const props = properties as Record<string, Obj> | undefined;
	const closed = additionalProperties === false ? { additionalProperties: false } : undefined;
	if (props && Object.keys(props).length > 0) {
		const requiredKeys = new Set((required as string[] | undefined) ?? []);
		const fields = Object.entries(props).map(([key, child]) => {
			const type = typeBox(child);
			return `${JSON.stringify(key)}: ${requiredKeys.has(key) ? type : `Type.Optional(${type})`}`;
		});
		return `Type.Object({ ${fields.join(', ')} }${tail(optionsLiteral(rest, closed))})`;
	}
	if (additionalProperties && typeof additionalProperties === 'object')
		return `Type.Record(Type.String(), ${typeBox(additionalProperties as Obj)}${tail(optionsLiteral(rest))})`;
	return `Type.Object({}${tail(optionsLiteral(rest, closed))})`;
}

function objectTsType(node: Obj): string {
	const props = node.properties as Record<string, Obj> | undefined;
	if (props && Object.keys(props).length > 0) {
		const required = new Set((node.required as string[] | undefined) ?? []);
		const fields = Object.entries(props).map(
			([key, child]) => `${JSON.stringify(key)}${required.has(key) ? '' : '?'}: ${tsType(child)}`,
		);
		return `{ ${fields.join('; ')} }`;
	}
	if (node.additionalProperties && typeof node.additionalProperties === 'object')
		return `Record<string, ${tsType(node.additionalProperties as Obj)}>`;
	return 'Record<string, never>';
}

function specialTypeBox(node: Obj): string | null {
	if (Array.isArray(node.anyOf)) {
		const { anyOf, ...rest } = node;
		return `Type.Union([${(anyOf as Obj[]).map(typeBox).join(', ')}]${tail(optionsLiteral(rest))})`;
	}
	if (Array.isArray(node.enum)) {
		const { enum: members, ...rest } = node;
		const literals = (members as unknown[]).map(
			(value) => `Type.Literal(${JSON.stringify(value)})`,
		);
		return literals.length === 1
			? literals[0]!
			: `Type.Union([${literals.join(', ')}]${tail(optionsLiteral(rest))})`;
	}
	if (!('const' in node)) return null;
	const { const: literal, ...rest } = node;
	return `Type.Literal(${JSON.stringify(literal)}${tail(optionsLiteral(rest))})`;
}

/** One draft-07 schema node as a `Type.*` expression. Mirrors kit/project.ts's node forms in reverse.
 *  A `$ref` node references its concept's sibling `<Name>Schema` const (imported) — composed, not
 *  restated, so a 301× shape appears once and TS keeps the inferred type small. */
export function typeBox(node: Obj): string {
	if (typeof node.$ref === 'string') return `${nsLocal(refName(node.$ref))}.schema`;
	const special = specialTypeBox(node);
	if (special) return special;
	switch (node.type) {
		case 'object':
			return objectTypeBox(node);
		case 'array': {
			const { items } = node;
			const rest = omit(node, ['type', 'items']);
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
export function tsType(node: Obj): string {
	if (typeof node.$ref === 'string') {
		const name = refName(node.$ref);
		return `${nsLocal(name)}.${pascal(name)}`;
	}
	if (Array.isArray(node.anyOf)) return (node.anyOf as Obj[]).map(tsType).join(' | ') || 'never';
	if (Array.isArray(node.enum))
		return (node.enum as unknown[]).map((v) => JSON.stringify(v)).join(' | ');
	if ('const' in node) return JSON.stringify(node.const);
	switch (node.type) {
		case 'object':
			return objectTsType(node);
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
