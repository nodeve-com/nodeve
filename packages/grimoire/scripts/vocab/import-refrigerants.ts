// Bulk vocab import — enumeration/refrigerant/ from the ASHRAE-34 canonical set (Wikipedia
// "List of refrigerants"), enriched with Wikidata QIDs. Loads the WHOLE set at once; never
// add-when-needed. Re-runnable/idempotent, MERGING authored local facts (pt, extra refs) which WIN.
//
//   pures   → title, formula, gwp, safety_class, refs(ashrae + wikidata)
//   blends  → title, composition[{refrigerant, mass_fraction}], safety_class, refs; GWP DERIVES
//             from the composition (Σ fraction × component gwp), never restated.
//
// Run: `node scripts/vocab/import-refrigerants.ts`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isPlainObject } from 'remeda';
import { parse, stringify } from 'yaml';
import { asciiFormula, qid, sparql } from './wikidata.ts';

const GENERATED_REGISTRIES = new Set(['ashrae_34', 'wikidata']);

/** The authored-only facts to carry across a re-import: the pt label and any refs to registries
 *  the importer doesn't own. Everything else is regenerated fresh, so re-runs stay idempotent
 *  (no stale composition/gwp accumulating — the bug the blind array-union caused). */
function authoredOverlay(path: string): { pt?: string; refs: unknown[] } {
	if (!existsSync(path)) return { refs: [] };
	const doc = parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	const title = isPlainObject(doc.title) ? doc.title : {};
	const refs = Array.isArray(doc.refs) ? doc.refs : [];
	return {
		pt: typeof title.pt === 'string' ? title.pt : undefined,
		refs: refs.filter(
			(r) => isPlainObject(r) && !GENERATED_REGISTRIES.has(String(r.registry_id)),
		),
	};
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', '..', 'concepts', 'enumeration', 'refrigerant');
const CACHE = join(HERE, 'refrigerants.wikitext');
const SOURCE =
	'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_refrigerants&prop=wikitext&format=json&formatversion=2';
const SAFETY = new Set(['A1', 'A2L', 'A2', 'A3', 'B1', 'B2L', 'B2', 'B3']);

async function wikitext(): Promise<string> {
	if (existsSync(CACHE)) return readFileSync(CACHE, 'utf8');
	const res = await fetch(SOURCE);
	if (!res.ok) throw new Error(`fetch ${res.status}`);
	const wt = ((await res.json()) as { parse: { wikitext: string } }).parse.wikitext;
	writeFileSync(CACHE, wt);
	return wt;
}

/** Split a wikitable row on `||`, but ONLY at top level — pipes inside `{{…}}` templates and
 *  `[[…]]` links are masked first so `{{#tag:ref name=x|group=y}}` / `[[R-410A|R-410A]]` don't
 *  shatter columns (the bug that mis-aligned GWP/safety in the first cut). */
function splitCells(row: string): string[] {
	const MASK = '';
	let depth = 0;
	let out = '';
	for (let i = 0; i < row.length; i++) {
		const two = row.slice(i, i + 2);
		if (two === '{{' || two === '[[') {
			depth++;
			out += two;
			i++;
		} else if (two === '}}' || two === ']]') {
			depth--;
			out += two;
			i++;
		} else if (row[i] === '|' && depth > 0) {
			out += MASK;
		} else out += row[i];
	}
	return out.split('||').map((c) => c.replaceAll(MASK, '|'));
}

/** Strip footnotes/sub-sup, unwrap [[links]] and {{Nts|n}}/{{·}}, collapse whitespace. */
const clean = (s: string): string =>
	s
		.replace(/<ref[^>]*\/>/g, '')
		.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
		.replace(/\{\{refn?\|[^}]*\}\}/gi, '')
		.replace(/\{\{#tag:ref[^}]*\}\}/gi, '')
		.replace(/<\/?su[bp]>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/\{\{Nts\|([^}]*)\}\}/g, '$1')
		.replace(/\{\{·\}\}/g, '·')
		.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.trim();

const numOf = (s: string): number | undefined => {
	const m = clean(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
	return m ? Number(m[0]) : undefined;
};

/** Canonical Hill-order atom count, so a structural formula (CHF2CF3) and its molecular twin
 *  (C2HF5) compare equal when matching a blend component to its pure member. */
function canonicalFormula(f: string): string {
	const counts: Record<string, number> = {};
	let any = false;
	for (const [, el, n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
		any = true;
		counts[el!] = (counts[el!] ?? 0) + (n ? Number(n) : 1);
	}
	if (!any) return '';
	const order = Object.keys(counts).sort((a, b) =>
		a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b),
	);
	return order.map((el) => el + (counts[el]! > 1 ? counts[el] : '')).join('');
}

const slugOf = (rawNum: string): string => 'r' + rawNum.toLowerCase().replace(/[^a-z0-9]/g, '');
const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

type Row = {
	rawNum: string;
	slug: string;
	name: string;
	formula: string;
	gwp?: number;
	safety?: string;
	blend: boolean;
	rawComponents: string; // col3 for blends — parsed after the formula index is built
};

function parseRows(wt: string): Row[] {
	const start = wt.indexOf('== List ==');
	const table = wt.slice(start, start + wt.slice(start).indexOf('\n|}'));
	const rows: Row[] = [];
	for (const block of table.split('\n|-')) {
		const line = block.trim();
		if (!line.startsWith('|') || line.startsWith('|+') || line.startsWith('|}')) continue;
		const cells = splitCells(line.replace(/^\|/, ''));
		if (cells.length < 9) continue;
		const rawNum = clean(cells[1] ?? '').match(/R-?\s*([0-9][0-9A-Za-z()]*)/)?.[1];
		if (!rawNum) continue;
		const blend = /^[45]\d\d/.test(rawNum); // ASHRAE: 400s zeotropic, 500s azeotropic blends
		const formula = asciiFormula(clean(cells[3] ?? '').split(/\s+or\s+/)[0] ?? '');
		const gwp = numOf(cells[7] ?? '');
		const safety = clean(cells[8] ?? '').match(/\b([AB][123]L?)\b/)?.[1];
		const iupac = cap(clean(cells[2] ?? ''));
		rows.push({
			rawNum,
			slug: slugOf(rawNum),
			name: blend || iupac.length < 3 ? `R-${rawNum}` : iupac, // no usable IUPAC name → R-designation
			formula,
			gwp: gwp !== undefined && gwp >= 0 ? gwp : undefined,
			safety: safety && SAFETY.has(safety) ? safety : undefined,
			blend,
			rawComponents: cells[3] ?? '',
		});
	}
	return rows;
}

/** Parse a blend's col3 (`50…% CH2F2 · 50…% CHF5`) into `{refrigerant, mass_fraction}` rows,
 *  mapping each component formula to its pure member slug. Skips components not found as pures. */
function composition(
	rawComponents: string,
	formulaToSlug: Map<string, string>,
): Array<{ refrigerant: string; mass_fraction: number }> | undefined {
	const out: Array<{ refrigerant: string; mass_fraction: number }> = [];
	for (const part of clean(rawComponents).split('·')) {
		const pct = part.trim().match(/^(\d+(?:\.\d+)?)/); // NOMINAL leading %, not the ±tolerance
		const formula = canonicalFormula(asciiFormula((part.split('%')[1] ?? '').replace(/[^A-Za-z0-9]/g, '')));
		const slug = formulaToSlug.get(formula);
		if (!pct || !slug) return undefined; // incomplete — don't emit a half-composition
		out.push({ refrigerant: slug, mass_fraction: Number(pct[1]) / 100 });
	}
	return out.length > 0 ? out : undefined;
}

/** rnum → Wikidata QID, keyed on the authoritative ASHRAE number (P4842) — no hand-picked QIDs,
 *  so name collisions (a QID that is an Italian train, not R-32) can't slip in. */
async function wikidataByAshrae(): Promise<Map<string, string>> {
	const rows = await sparql('SELECT ?rnum ?item WHERE { ?item wdt:P4842 ?rnum. }');
	return new Map(rows.map((r) => [r.rnum!.toUpperCase(), qid(r.item!)]));
}

const rows = parseRows(await wikitext());
const formulaToSlug = new Map(
	rows.filter((r) => !r.blend && r.formula).map((r) => [canonicalFormula(r.formula), r.slug]),
);
const gwpBySlug = new Map(rows.filter((r) => r.gwp !== undefined).map((r) => [r.slug, r.gwp!]));
const qids = await wikidataByAshrae();

let wrote = 0;
for (const row of rows) {
	const path = join(DIR, `${row.slug}.yaml`);
	const overlay = authoredOverlay(path);
	const refs: Array<Record<string, unknown>> = [
		{ registry_id: 'ashrae_34', term: `R-${row.rawNum}`, match: 'exact' },
	];
	const wd = qids.get(row.rawNum.toUpperCase());
	if (wd) refs.push({ registry_id: 'wikidata', term: wd, match: 'exact' });
	refs.push(...overlay.refs); // foreign-registry refs the author added

	const member: Record<string, unknown> = {
		title: { en: row.name, ...(overlay.pt ? { pt: overlay.pt } : {}) },
		refs,
	};
	const substance: Record<string, unknown> = {};
	if (row.safety) substance.safety_class = row.safety;

	if (row.blend) {
		const comp = composition(row.rawComponents, formulaToSlug);
		if (comp) {
			member.composition = comp;
			// derive GWP from the formulation — only if every component GWP is known
			const gwps = comp.map((c) => gwpBySlug.get(c.refrigerant));
			if (gwps.every((g) => g !== undefined))
				substance.gwp = Math.round(
					comp.reduce((s, c, i) => s + c.mass_fraction * gwps[i]!, 0),
				);
		}
	} else {
		if (row.formula) substance.formula = row.formula;
		if (row.gwp !== undefined) substance.gwp = row.gwp;
	}
	if (Object.keys(substance).length > 0) member.substance = substance;

	writeFileSync(path, stringify(member, { lineWidth: 0 }));
	wrote++;
}
console.log(`refrigerant: wrote ${wrote} members (${qids.size} QID-matched) to ${DIR}`);
