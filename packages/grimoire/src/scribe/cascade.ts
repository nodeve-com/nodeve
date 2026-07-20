// The `_defaults.yaml` cascade — grimoire's ONE deep-merge desugar. Walking a source dir, each
// level's `_defaults.yaml` deep-merges into every descendant (nested objects merge; arrays and
// scalars REPLACE — a leaf's register map replaces a family's, never appends), leaf winning on
// conflict. `.example.yaml` samples and other `_`-prefixed files are skipped; `_defaults.yaml` is
// consumed (folded), never emitted. Each surviving leaf is slug-stamped (identity.ts); under
// `conceptRules` it also passes the concept-mode raw text gates (validate-raw.ts). THE single YAML
// load surface in grimoire, in both directions: `readRaw`/`scribeTree` parse to DATA (the only
// `parseYaml` — everything downstream reads the JSON emitted here), and `readDocument`/`yamlFiles`
// load the authored tree as a DOCUMENT (the only `parseDocument`) for in-place rewrites. Import
// `yaml` anywhere else and one of those two guarantees is gone.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPlainObject, mergeDeep } from 'remeda';
import { type Document, parse as parseYaml, parseDocument } from 'yaml';
import { type Obj, stampIdentity } from './identity.ts';
import { validateConceptText } from './validate-raw.ts';

/** Conversion options. `conceptRules` turns on the grimoire concept-authoring raw gates (no oversized
 *  comment blocks, no empty leaf) — off by default, so generic YAML→JSON conversion stays permissive
 *  (comments and terse files are normal there). */
export interface ScribeOptions {
	conceptRules?: boolean;
}

const DEFAULTS = '_defaults.yaml';
const isLeaf = (f: string): boolean =>
	f.endsWith('.yaml') && f !== DEFAULTS && !f.startsWith('_') && !f.endsWith('.example.yaml');

/** Parse one YAML file to an object (empty file → `{}`). `conceptText` runs the concept-mode raw text
 *  gates first — applied under `conceptRules` to leaves AND `_defaults.yaml` cascade files alike:
 *  durable prose belongs in a `body:` field or dev docs, never a comment (it survives no projection). */
export function readRaw(path: string, conceptText = false): unknown {
	const text = readFileSync(path, 'utf8');
	if (conceptText) validateConceptText(path, text);
	return parseYaml(text) ?? {};
}

/** Every `.yaml` under `dir`, recursively — the AUTHORED tree's walk. (`concept-sources` walks the
 *  BAKED artifacts/database mirror; a rewrite must touch the source, not the emit.) */
export const yamlFiles = (dir: string): string[] =>
	readdirSync(dir, { recursive: true, encoding: 'utf8' })
		.filter((name) => name.endsWith('.yaml'))
		.map((name) => join(dir, name));

/** Load one YAML file as a DOCUMENT — the comment-preserving twin of `readRaw`. `readRaw` parses to
 *  data (comments dropped, correct for everything downstream); a migration instead REWRITES the
 *  source in place, so it must move nodes inside the document rather than re-serialize from parsed
 *  data — which would discard every comment and reflow the file. The only `parseDocument` in
 *  grimoire: scripts/migrate-*.ts share this one entry point. */
export const readDocument = (path: string): Document => parseDocumentText(readFileSync(path, 'utf8'));

/** The same, from text already in hand — for a caller that needs the source string AND its node
 *  ranges (scripts/format-concept-bodies.ts edits inside parser-reported byte ranges). */
export const parseDocumentText = (text: string): Document => parseDocument(text);

/** Desugar a whole source tree: relative path (`.yaml` → `.json`) → the merged, slug-stamped doc.
 *  Deep-folds the `_defaults.yaml` cascade from `srcRoot` down; the map mirrors the source layout
 *  minus the consumed cascade files. */
export function scribeTree(srcRoot: string, opts: ScribeOptions = {}): Map<string, unknown> {
	const concept = opts.conceptRules === true;
	const out = new Map<string, unknown>();
	const walk = (dir: string, inherited: Obj): void => {
		const names = readdirSync(dir, { withFileTypes: true });
		const hasDefaults = names.some((e) => e.isFile() && e.name === DEFAULTS);
		const ctx = hasDefaults
			? (mergeDeep(inherited, readRaw(join(dir, DEFAULTS), concept) as Obj) as Obj)
			: inherited;
		for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
			const path = join(dir, entry.name);
			const rel = relative(srcRoot, path).replace(/\.yaml$/, '.json');
			if (entry.isDirectory()) walk(path, ctx);
			else if (isLeaf(entry.name)) {
				const own = readRaw(path, concept);
				// A non-object root (a top-level sequence/scalar YAML) can't take a `_defaults` merge or an
				// identity stamp — pass it through verbatim. Only mapping docs cascade + get slug-stamped.
				if (!isPlainObject(own)) {
					out.set(rel, own);
					continue;
				}
				// A concept leaf earns its file by saying something. Check the OWN content before folding
				// the cascade — once `_defaults` merges in every leaf is non-empty, so this raw-authoring
				// signal only survives here (it can't be recovered downstream from the JSON).
				if (concept && Object.keys(own).length === 0)
					throw new Error(`grimoire scribe: ${path} is empty — author it or delete the file`);
				const stem = entry.name.slice(0, -'.yaml'.length);
				out.set(rel, stampIdentity(mergeDeep(ctx, own) as Obj, stem));
			}
		}
	};
	walk(srcRoot, {});
	return out;
}
