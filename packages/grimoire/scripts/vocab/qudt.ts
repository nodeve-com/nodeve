// QUDT quantity-kind oracle. QUDT is NOT the member source for enumeration/quantity_kind/ (the local
// vocab is a CURATED domain subset with local names — `current` not `ElectricCurrent`, three energies
// from one QUDT `Energy` — and load-bearing slugs the feature graph keys on). QUDT is the CROSSWALK
// AUTHORITY: this distills its 1219 kinds to a committed `qudt-quantitykind.json` so the guard can
// verify every member's `qudt_quantity_kind` ref term is real, and a mint step can autofill
// label/broader/wikidata — "never hand-verify a kind again" without flooding the vocab.
//
// Run `node scripts/vocab/qudt.ts` to refresh the cache (pass a TTL path or it fetches v3.4.0).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TTL = join(HERE, 'quantitykind.ttl'); // gitignored raw cache
export const ORACLE = join(HERE, 'qudt-quantitykind.json'); // committed distilled crosswalk
const SOURCE = 'https://qudt.org/vocab/quantitykind';

export type Kind = { label: string; broader?: string; wikidata?: string };

async function ttl(): Promise<string> {
	if (existsSync(TTL)) return readFileSync(TTL, 'utf8');
	const res = await fetch(SOURCE);
	if (!res.ok) throw new Error(`fetch ${res.status}`);
	const body = await res.text();
	writeFileSync(TTL, body);
	return body;
}

/** Parse the QUDT TTL into `{ <QuantityKind localname>: {label, broader?, wikidata?} }`. */
export function parseKinds(source: string): Record<string, Kind> {
	const out: Record<string, Kind> = {};
	for (const block of source.split(/\n(?=quantitykind:)/)) {
		const term = block.match(/^quantitykind:(\S+)/)?.[1];
		if (!term || !/\ba\s+qudt:QuantityKind\b/.test(block)) continue;
		// QUDT carries labels in many languages — prefer @en, else an untagged label, else the first.
		const labels = [...block.matchAll(/rdfs:label\s+"((?:[^"\\]|\\.)*)"(@[\w-]+)?/g)];
		const label =
			(labels.find((m) => m[2] === '@en') ?? labels.find((m) => !m[2]) ?? labels[0])?.[1];
		if (!label) continue;
		const broader = block.match(/skos:broader\s+quantitykind:([^\s;.]+)/)?.[1];
		const wikidata = block.match(/qudt:wikidataMatch\s+<[^>]*\/(Q\d+)>/)?.[1];
		out[term] = { label, ...(broader ? { broader } : {}), ...(wikidata ? { wikidata } : {}) };
	}
	return out;
}

/** The committed oracle (parsed once). */
export const loadOracle = (): Record<string, Kind> =>
	JSON.parse(readFileSync(ORACLE, 'utf8')) as Record<string, Kind>;

if (import.meta.filename === process.argv[1]) {
	const src = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await ttl();
	const kinds = parseKinds(src);
	const sorted = Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => a.localeCompare(b)));
	writeFileSync(ORACLE, JSON.stringify(sorted, null, '\t') + '\n');
	console.log(`qudt: distilled ${Object.keys(sorted).length} quantity kinds → ${ORACLE}`);
}
