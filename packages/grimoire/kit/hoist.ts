// Structural hoisting for a generated TS-const module: a data subtree that appears more than once
// (a repeated-feature `default` the catalog emit materialized into every `part.<name>`) is lifted to
// one file-local const and referenced at each site — the same runtime value, deduplicated at source
// (no restated block for a copy-paste gate to flag). BUILD-ONLY (generate.ts). Keys sort like the
// JSON emit so an identical subtree always renders identically (its structural identity, stableStringify).

import { type Obj, isObj } from './concept-sources.ts';
import { stableStringify } from './project.ts';

const isColl = (v: unknown): v is Obj | unknown[] => isObj(v) || Array.isArray(v);
const children = (node: Obj | unknown[]): unknown[] =>
	Array.isArray(node) ? node : Object.keys(node).sort().map((k) => node[k]);

/** Canonical length below which a duplicated subtree isn't worth a const — a copy-paste gate only
 *  flags sizable blocks, and hoisting every `{}` would bury the file in one-liners. */
const MIN_LEN = 60;

/** Tally every collection subtree by its canonical form, so a shape repeated across parts is seen once. */
function tally(node: unknown, counts: Map<string, { n: number; node: unknown }>): void {
	if (!isColl(node)) return;
	const key = stableStringify(node);
	const e = counts.get(key);
	if (e) e.n++;
	else counts.set(key, { n: 1, node });
	for (const c of children(node)) tally(c, counts);
}

/** One value as a TS literal, indented; a hoisted subtree (other than `self`, the const being defined)
 *  collapses to its const name. Children always substitute, so a hoisted node nested in another is
 *  referenced — the deeper const is shorter, so it's declared first. */
function render(node: unknown, indent: string, names: Map<string, string>, self: string): string {
	if (isColl(node)) {
		const key = stableStringify(node);
		const name = names.get(key);
		if (name && key !== self) return name;
	}
	const inner = indent + '\t';
	if (Array.isArray(node)) {
		if (node.length === 0) return '[]';
		return `[\n${node.map((c) => inner + render(c, inner, names, self)).join(',\n')}\n${indent}]`;
	}
	if (isObj(node)) {
		const keys = Object.keys(node).sort();
		if (keys.length === 0) return '{}';
		return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${render(node[k], inner, names, self)}`).join(',\n')}\n${indent}}`;
	}
	return JSON.stringify(node);
}

/** `export const <name>` for a data value, lifting every repeated subtree to a file-local const first
 *  (deepest/shortest declared first so a nested reference resolves). The reconstructed object graph
 *  equals the input — only the source is deduplicated. */
export function renderHoistedConst(name: string, value: unknown): string {
	const counts = new Map<string, { n: number; node: unknown }>();
	tally(value, counts);
	const chosen = [...counts.values()]
		.filter((e) => e.n >= 2 && stableStringify(e.node).length >= MIN_LEN)
		.sort((a, b) => stableStringify(a.node).length - stableStringify(b.node).length);
	const names = new Map<string, string>();
	chosen.forEach((e, i) => names.set(stableStringify(e.node), `_s${i}`));
	const defs = chosen.map((e) => {
		const key = stableStringify(e.node);
		return `const ${names.get(key)!} = ${render(e.node, '', names, key)} as const;`;
	});
	const body = render(value, '', names, stableStringify(value));
	return `${defs.length > 0 ? `${defs.join('\n')}\n\n` : ''}export const ${name} = ${body} as const;\n`;
}
