// The interval slug is authored, not generated — but every word in it must be
// EARNED. It may name any ordered subsequence of the values its facets actually
// set (`discriminates`, schema order); nothing set ⇒ `_`. So a band with
// `rating: continuous, severity: nominal` may be `nominal`, `continuous`, or
// `continuous-nominal` — the author picks what discriminates — but never
// `rated`, and never a word restating the facet itself. docs/intervals.md.
import { classByTable, discriminatorsOf, seg, slotByName } from './model.ts';
import type { Doc } from './registers.ts';

/** an interval's earnable slug words, in slug order — facet rows keyed by sql_table */
export function components(facetByTable: Record<string, Doc>): string[] {
	const out: string[] = [];
	for (const table of discriminatorsOf('Interval'))
		collect(classByTable[table], facetByTable[table], out);
	return out;
}

function collect(cls: string | undefined, row: Doc | undefined, out: string[]) {
	if (!cls || !row) return;
	for (const name of discriminatorsOf(cls)) {
		const value = row[name];
		if (value === undefined || value === null) continue;
		// a child row-set (conditions) contributes through its own components
		if (Array.isArray(value)) {
			for (const child of value) collect(slotByName[name]?.range, child as Doc, out);
			continue;
		}
		// enum value or assembled FK path — the leaf is the word, kebab like every segment
		const word = seg(String(value).split('/').pop()!);
		if (!out.includes(word)) out.push(word);
	}
}

/** does `slug` join an ordered subsequence of `words`? `_` iff there are none */
export function earns(slug: string, words: string[]): boolean {
	if (slug === '_') return words.length === 0;
	const from = (rest: string, i: number): boolean =>
		words.some(
			(w, j) =>
				j >= i &&
				(rest === w || (rest.startsWith(`${w}-`) && from(rest.slice(w.length + 1), j + 1))),
		);
	return from(slug, 0);
}
