// Shared Wikidata SPARQL client for bulk vocab import — one structured spine for every bounded
// enumeration (refrigerant, quantity_kind, …). Typed columns, stable QIDs for `refs`, no scraping.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isPlainObject } from 'remeda';
import { parse, stringify } from 'yaml';

const ENDPOINT = 'https://query.wikidata.org/sparql';

/** Run a SPARQL SELECT, returning rows as plain `{ var: value }` (bindings flattened to strings). */
export async function sparql(query: string): Promise<Array<Record<string, string>>> {
	const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
		headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'nodeve-grimoire-vocab' },
	});
	if (!res.ok) throw new Error(`sparql ${res.status}: ${await res.text()}`);
	const body = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
	return body.results.bindings.map((row) =>
		Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value])),
	);
}

/** `http://www.wikidata.org/entity/Q131189` → `Q131189`. */
export const qid = (uri: string): string => uri.split('/').pop() ?? uri;

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** Chemical formula to code-like ASCII: unicode subscripts → digits, drop whitespace (H₂O → H2O). */
export const asciiFormula = (s: string): string =>
	[...s].map((c) => (SUB.includes(c) ? String(SUB.indexOf(c)) : c)).join('').replace(/\s+/g, '');

/** Deep-merge with AUTHORED winning at every leaf; `refs` arrays union by `registry_id` (authored
 *  entry wins, imported adds registries the author didn't list). Preserves local facts upstream lacks. */
export function mergeAuthored(imported: unknown, authored: unknown): unknown {
	if (authored === undefined) return imported;
	if (Array.isArray(imported) && Array.isArray(authored)) {
		const key = (r: unknown) => (isPlainObject(r) ? String(r.registry_id ?? JSON.stringify(r)) : JSON.stringify(r));
		const byKey = new Map(imported.map((r) => [key(r), r]));
		for (const r of authored) byKey.set(key(r), r);
		return [...byKey.values()];
	}
	if (!isPlainObject(imported) || !isPlainObject(authored)) return authored;
	const out: Record<string, unknown> = { ...imported };
	for (const [k, v] of Object.entries(authored)) out[k] = mergeAuthored(imported[k], v);
	return out;
}

/** Write one member YAML, merging any authored file over the imported doc (authored wins). */
export function writeMember(path: string, imported: unknown): void {
	const authored = existsSync(path) ? parse(readFileSync(path, 'utf8')) : undefined;
	writeFileSync(path, stringify(mergeAuthored(imported, authored), { lineWidth: 0 }));
}
