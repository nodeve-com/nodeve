// Overlay application for the YAML→concept resolver (kit/compile.ts): one entry `<name>: {…}` per
// field, each entry an OVERLAY on that field's base. `<name>: {}` includes the field unchanged.
// Outer def wins over composed source. Overlay keys:
//   feature: <slug>              — SLOT: rebind the field's shape to that feature. Legal ONLY on a
//                                  `feature:` map entry; a `prop:` overlay with `feature:` is rejected
//                                  in kit/compile.ts (a prop references a property, never a slot).
//   archetype: <slug>            — SLOT: rebind the field's shape to that sibling archetype. Legal ONLY
//                                  on an `archetype:` map entry (the analog of the `feature:` rebind).
//   array: true                  — wrap the field as `{array: node}` (`{type: array, items}`).
//   map: true                    — wrap it as a slug-keyed RECORD (`additionalProperties`).
//   parts: <category> | {<category>: [ids]} — instance-key the field by a property category its
//                                  feature cites via `enums:`; a subset is a validated FILTER of
//                                  the category, never a second member list.
//   compose: [slug…]             — literal overlay: merge the named siblings' whole resolved nodes
//                                  in (props + node data); the outer def wins.
//   schema: {…}                  — deep-merge into the field's `schema:` block. `required: true`
//                                  stays on the field (the schema projection reads it into the
//                                  parent's `required`); `env-var` is normalized to `x-env-var`.
//   title/description/ui: {…}    — override the field's authored data.
//   anything else (an object)    — descend into that child field (through an `array` wrapper).
// The resolver is INJECTED (`Resolver`) — this module never reads the concept tree itself.

import { clone, isPlainObject, mergeDeep } from 'remeda';
import { type Obj, asList, enumerationMembers } from '../src/concept-sources.ts';

/** Object-node scaffold every resolved shape starts from (kit/compile.ts builds these). Authoring
 *  vocabulary: the props map is `prop`, verbatim from the YAML — no synthesized `fields`/`required`.
 *  Required-ness rides each field's own `schema.required`; the schema projection derives the parent
 *  `required` array from it (kit/project.ts). */
export interface Shape {
	prop: Obj;
}

/** The resolution callback a rebind (`feature:` / `archetype:` / `compose:`) walks back through. */
export interface Resolver {
	concept(slug: string, stack: string[]): Obj;
}

/** A def's `prop:` map — one `<name>: overlay` entry per field it contributes or refines. */
export function overridesOf(def: Obj): Obj {
	return isPlainObject(def.prop) ? clone(def.prop) : {};
}

function applyParts(options: {
	node: Obj;
	parts: string | Obj;
	key: string;
	stack: string[];
}): Obj {
	const { parts, key, stack } = options;
	const partMap: Obj = typeof parts === 'string' ? { [parts]: null } : parts;
	let out = options.node;
	for (const [enumeration, idsRaw] of Object.entries(partMap)) {
		const members = enumerationMembers(enumeration);
		const ids = idsRaw === null ? members : asList(idsRaw, `parts.${enumeration}`, stack);
		const stale = ids.filter((id) => !members.includes(id));
		if (stale.length > 0)
			throw new Error(
				`grimoire compile: parts filter on "${key}" names non-members of enumeration/${enumeration}/: ${stale.join(', ')} (via ${stack.join(' → ')})`,
			);
		const value = clone(out);
		if (isPlainObject(value.prop)) delete (value.prop as Obj)[enumeration];
		out = clone(out);
		if (!isPlainObject(out.prop)) continue;
		delete (out.prop as Obj)[enumeration];
		for (const id of ids) (out.prop as Obj)[id] = clone(value);
	}
	return out;
}

function applyComposes(options: {
	node: Obj;
	slugs: unknown[];
	stack: string[];
	resolve: Resolver;
}): Obj {
	const { slugs, stack, resolve } = options;
	let out = options.node;
	for (const slug of slugs.map(String)) {
		const { prop, ...data } = resolve.concept(slug, stack);
		Object.assign(out.prop as Obj, clone(prop as Obj));
		out = mergeDeep(clone(data), out) as Obj;
	}
	return out;
}

function applySchema(node: Obj, schema: Obj): Obj {
	const patch = clone(schema);
	if ('env-var' in patch) {
		patch['x-env-var'] = patch['env-var'];
		delete patch['env-var'];
	}
	return Object.keys(patch).length > 0 ? mergeDeep(node, { schema: patch }) : node;
}

function applyChildren(options: {
	node: Obj;
	overlay: Obj;
	consumed: Set<string>;
	stack: string[];
	resolve: Resolver;
}): Obj {
	const { overlay, consumed, stack, resolve } = options;
	let out = options.node;
	for (const [key, child] of Object.entries(overlay)) {
		if (consumed.has(key)) continue;
		const target = isPlainObject(out.array) ? (out.array as Obj) : out;
		const prop = target.prop as Obj | undefined;
		if (isPlainObject(child) && prop && key in prop)
			prop[key] = applyOverride({ node: prop[key] as Obj, overlay: child, key, stack, resolve });
		else out = { ...out, [key]: clone(child) };
	}
	return out;
}

function applyRebind(options: {
	node: Obj;
	overlay: Obj;
	stack: string[];
	resolve: Resolver;
	consumed: Set<string>;
}): Obj {
	const { overlay, stack, resolve, consumed } = options;
	let out = options.node;
	for (const key of ['feature', 'archetype']) {
		if (typeof overlay[key] !== 'string') continue;
		out = resolve.concept(overlay[key] as string, stack);
		consumed.add(key);
	}
	return out;
}

/** Apply one field's overlay to its resolved node. Each overlay key is CONSUMED as it's handled;
 *  whatever remains (an object value) is a child descent — so the overlay vocabulary lives here, in
 *  the code that interprets it, not in a keyword table. */
export function applyOverride(options: {
	node: Obj;
	overlay: Obj;
	key: string;
	stack: string[];
	resolve: Resolver;
}): Obj {
	const { node, overlay: o, key, stack, resolve } = options;
	const consumed = new Set<string>();
	let out = applyRebind({ node, overlay: o, stack, resolve, consumed });

	// parts: instance-key the field by an enumeration its feature cites via `enums:` —
	// `parts: <enumeration>` keys by every member; `parts: {<enumeration>: [ids]}` NARROWS to a
	// validated subset. Each part block (and the shared level) is the field's own shape minus
	// the enumeration field (the KEY carries that identity).
	if (typeof o.parts === 'string' || isPlainObject(o.parts)) {
		consumed.add('parts');
		out = applyParts({ node: out, parts: o.parts, key, stack });
	}

	// compose: a LITERAL overlay — the named sibling's whole resolved node merges in (shared level
	// only, never into part blocks): its props onto the shape, its node data UNDER the field's own.
	// Each prop keeps its own `schema.required`, so required-ness travels with the field.
	if (Array.isArray(o.compose)) {
		consumed.add('compose');
		out = applyComposes({ node: out, slugs: o.compose, stack, resolve });
	}

	if (o.array === true) {
		out = { array: out };
		consumed.add('array');
	}
	// map: a RECORD of the field's shape, keyed by an authored slug (e.g. the VE.Direct field map).
	if (o.map === true) {
		out = { map: out };
		consumed.add('map');
	}

	// schema: deep-merge into the node's `schema:` block (a leaf's block, or an object node's patch
	// the projection overlays last).
	if (isPlainObject(o.schema)) {
		consumed.add('schema');
		out = applySchema(out, o.schema);
	}

	// Every remaining overlay key is a plain MERGE onto the node — the resolver does not judge which
	// keys are legal. An OBJECT naming a compiled field of this node descends into it; anything else
	// (a data fact like `title`/`description`/`refs`, or an object that overrides node-level data)
	// rides the node verbatim. What top-level keys a field may carry is defined by its archetype
	// (`identity.archetype`); a misplaced JSON-Schema keyword (`min_length` bare instead of
	// `schema: { minLength }`) is caught by validating the resolved node against that archetype,
	// not by a keyword list here.
	return applyChildren({ node: out, overlay: o, consumed, stack, resolve });
}
