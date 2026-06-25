/**
 * Commit gate (advisory): flag a locally-declared function whose name fuzzily
 * matches a dependency export — a likely reinvention of a lib function (e.g.
 * local `clamp255` ≈ remeda `clamp`). Token-set matching catches transpositions
 * like `byGroup`/`groupBy` where edit-distance fails.
 */
import { identifierSimilarityMatch } from '@nodeve/text/similarity';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { parseSource } from '../lib/ast.js';
import { tsSources } from '../lib/bin.js';
import { type Config } from '../lib/config.js';
import { type Check } from '../lib/runner.js';

type LibFn = { lib: string; name: string; matchedAs?: string };

function loadLibIndex(root: string, cfg: Config['helperCollisions']): LibFn[] {
	const path = join(root, cfg.libNamesPath);
	// Missing index → no-op (clean), not a crash: a repo that hasn't run
	// `nodeve-build-lib-names` yet shouldn't fail the commit on this advisory gate.
	if (!existsSync(path)) return [];
	const { names } = JSON.parse(readFileSync(path, 'utf8')) as { names: Record<string, string[]> };
	return Object.entries(names).flatMap(([lib, list]) => list.map((name) => ({ lib, name })));
}

/** Top-level `function` / arrow-const declaration names in a source file. */
function declaredFunctionNames(absPath: string): string[] {
	const src = parseSource(absPath);
	const out: string[] = [];
	for (const stmt of src.statements) {
		if (ts.isFunctionDeclaration(stmt) && stmt.name) out.push(stmt.name.text);
		else if (ts.isVariableStatement(stmt))
			for (const d of stmt.declarationList.declarations)
				if (
					ts.isIdentifier(d.name) &&
					d.initializer &&
					(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
				)
					out.push(d.name.text);
	}
	return out;
}

function bestMatch(
	name: string,
	libIndex: LibFn[],
	cfg: Config['helperCollisions'],
): { lib: LibFn; score: number } | null {
	let best: { lib: LibFn; score: number } | null = null;
	for (const lib of libIndex) {
		const match = identifierSimilarityMatch(name, lib.name, {
			keywords: cfg.libKeywords[lib.lib],
			aliases: cfg.aliases[lib.name],
		});
		const matched = match.matchedAs === lib.name ? lib : { ...lib, matchedAs: match.matchedAs };
		const score = match.score;
		if (!best || score > best.score) best = { lib: matched, score };
	}
	return best && best.score >= cfg.threshold ? best : null;
}

export const helperCollisions: Check<'helperCollisions'> = {
	name: 'helper-collisions',
	section: 'helperCollisions',
	explain: `A locally-declared function whose name fuzzily matches a dependency
export is a likely reinvention of a lib function. Routing a hit is a JUDGEMENT
call — resolve per case:
  • delete the local and import the dependency export;
  • wrap the lib (keep a project-specific name, delegate the body);
  • rename the local for specificity if it genuinely does something different;
  • or allowlist it as \`relPath::local→lib\`.
Matching is against the committed lib-names index (helperCollisions.libNamesPath);
regen with \`nodeve-build-lib-names\`. --warn downgrades this to report-only.`,

	run({ root, cfg, paths, allowlist }) {
		const libIndex = loadLibIndex(root, cfg);
		type Collision = { name: string; lib: LibFn; score: number; files: Set<string> };
		const collisions = new Map<string, Collision>();

		for (const rel of tsSources(root, cfg.globs, paths)) {
			const abs = join(root, rel);
			for (const name of declaredFunctionNames(abs)) {
				const m = bestMatch(name, libIndex, cfg);
				if (!m) continue;
				const pairKey = `${name}→${m.lib.name}`;
				if (allowlist.has(`${rel}::${pairKey}`)) continue;
				const found = collisions.get(pairKey) ?? {
					name,
					lib: m.lib,
					score: m.score,
					files: new Set(),
				};
				found.files.add(rel);
				collisions.set(pairKey, found);
			}
		}

		const sorted = [...collisions.values()].sort((a, b) => b.score - a.score);
		if (sorted.length === 0)
			return { status: 'pass', summary: `clean (${libIndex.length} lib fns checked)` };

		const rows: string[] = [];
		for (const f of sorted) {
			const matchedAs = f.lib.matchedAs ? ` (matched ${f.lib.matchedAs})` : '';
			rows.push(`${f.score.toFixed(2)}  ${f.name}  ≈  ${f.lib.lib}.${f.lib.name}${matchedAs}`);
			for (const file of f.files) rows.push(`  ${file}`);
		}
		return {
			status: 'fail',
			summary: `${sorted.length} local function(s) may reinvent a dependency export`,
			rows,
		};
	},
};
