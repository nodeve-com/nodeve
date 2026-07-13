// Structural hoisting for a generated TS-const module: a data subtree that appears more than once
// (a repeated-feature `default` the catalog emit materialized into every `part.<name>`) is lifted to
// one file-local const and referenced at each site — the same runtime value, deduplicated at source
// (no restated block for a copy-paste gate to flag). BUILD-ONLY (generate.ts). Keys sort like the
// JSON emit so an identical subtree always renders identically (its structural identity, stableStringify).

import { type Obj } from '../src/concept-sources.ts';
import { isPlainObject } from 'remeda';
import { stableStringify } from './project.ts';

const isColl = (v: unknown): v is Obj | unknown[] => isPlainObject(v) || Array.isArray(v);
const children = (node: Obj | unknown[]): unknown[] =>
	Array.isArray(node) ? node : Object.keys(node).sort().map((k) => node[k]);

/** Canonical length below which a duplicated subtree isn't worth a const — a copy-paste gate only
 *  flags sizable blocks, and hoisting every `{}` would bury the file in one-liners. */
const MIN_LEN = 60;

/** Count every collection subtree by its canonical form, so a shape repeated across parts is seen once. */
function countForms(node: unknown, countByForm: Map<string, { n: number; node: unknown }>): void {
	if (!isColl(node)) return;
	const key = stableStringify(node);
	const e = countByForm.get(key);
	if (e) e.n++;
	else countByForm.set(key, { n: 1, node });
	for (const c of children(node)) countForms(c, countByForm);
}

/** One value as a TS literal, indented; a hoisted subtree (other than `self`, the const being defined)
 *  collapses to its const name. Children always substitute, so a hoisted node nested in another is
 *  referenced — the deeper const is shorter, so it's declared first. */
function render(node: unknown, indent: string, constByForm: Map<string, string>, self: string): string {
	if (isColl(node)) {
		const key = stableStringify(node);
		const name = constByForm.get(key);
		if (name && key !== self) return name;
	}
	const inner = indent + '\t';
	if (Array.isArray(node)) {
		if (node.length === 0) return '[]';
		return `[\n${node.map((c) => inner + render(c, inner, constByForm, self)).join(',\n')}\n${indent}]`;
	}
	if (isPlainObject(node)) {
		const keys = Object.keys(node).sort();
		if (keys.length === 0) return '{}';
		return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${render(node[k], inner, constByForm, self)}`).join(',\n')}\n${indent}}`;
	}
	return JSON.stringify(node);
}

/** `export default` for a data value, lifting every repeated subtree to a file-local const first
 *  (deepest/shortest declared first so a nested reference resolves). The reconstructed object graph
 *  equals the input — only the source is deduplicated. */
export function renderHoistedConst(value: unknown): string {
	const countByForm = new Map<string, { n: number; node: unknown }>();
	countForms(value, countByForm);
	const chosen = [...countByForm.values()]
		.filter((e) => e.n >= 2 && stableStringify(e.node).length >= MIN_LEN)
		.sort((a, b) => stableStringify(a.node).length - stableStringify(b.node).length);
	const constByForm = new Map<string, string>();
	chosen.forEach((e, i) => constByForm.set(stableStringify(e.node), `_s${i}`));
	const defs = chosen.map((e) => {
		const key = stableStringify(e.node);
		return `const ${constByForm.get(key)!} = ${render(e.node, '', constByForm, key)} as const;`;
	});
	const body = render(value, '', constByForm, stableStringify(value));
	return `${defs.length > 0 ? `${defs.join('\n')}\n\n` : ''}export default ${body} as const;\n`;
}
