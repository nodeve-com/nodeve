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
import { type Gate, scopedTsSources } from '../lib/bin.js';
import { type Config } from '../lib/config.js';
import { type Check } from '../lib/runner.js';

type LibFn = { lib: string; name: string; matchedAs?: string };

function loadLibIndex(root: string, cfg: Config['helperCollisions']): LibFn[] {
	const path = join(root, cfg.libNamesPath);
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
			out.push(...stmt.declarationList.declarations.flatMap(functionName));
	}
	return out;
}

function functionName(declaration: ts.VariableDeclaration): string[] {
	const { name, initializer } = declaration;
	return ts.isIdentifier(name) &&
		initializer &&
		(ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
		? [name.text]
		: [];
}

type Collision = { name: string; lib: LibFn; score: number; files: Set<string> };

function collisions(gate: Gate<'helperCollisions'>, libIndex: LibFn[]) {
	const { root, cfg, allowlist } = gate;
	const byPair = new Map<string, Collision>();
	for (const rel of scopedTsSources(gate, true)) {
		for (const name of declaredFunctionNames(join(root, rel))) {
			const match = bestMatch(name, libIndex, cfg);
			if (!match) continue;
			const pair = `${name}→${match.lib.name}`;
			if (allowlist.has(`${rel}::${pair}`)) continue;
			const found = byPair.get(pair) ?? {
				name,
				lib: match.lib,
				score: match.score,
				files: new Set(),
			};
			found.files.add(rel);
			byPair.set(pair, found);
		}
	}
	return [...byPair.values()].sort((a, b) => b.score - a.score);
}

function collisionRows(items: Collision[]): string[] {
	return items.flatMap((item) => {
		const matchedAs = item.lib.matchedAs ? ` (matched ${item.lib.matchedAs})` : '';
		const heading = `${item.score.toFixed(2)}  ${item.name}  ≈  ${item.lib.lib}.${item.lib.name}${matchedAs}`;
		return [heading, ...[...item.files].map((file) => `  ${file}`)];
	});
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

	run(gate) {
		const { root, cfg } = gate;
		// A repo opts into this gate by listing `libs`. Once opted in, a missing
		// index is a setup error, not a pass: silently no-opping means the gate
		// looks green while checking nothing. Fail loudly so the index gets built.
		if (cfg.libs.length > 0 && !existsSync(join(root, cfg.libNamesPath)))
			return {
				status: 'fail',
				summary: `lib-names index missing (${cfg.libNamesPath}) — this gate is checking nothing`,
				rows: [
					`libs configured: ${cfg.libs.join(', ')}`,
					`regenerate and commit it: nodeve-build-lib-names`,
					`or opt out by setting helperCollisions.libs: [] in nodeve.checks.js`,
				],
			};

		const libIndex = loadLibIndex(root, cfg);
		const sorted = collisions(gate, libIndex);
		if (sorted.length === 0)
			return { status: 'pass', summary: `clean (${libIndex.length} lib fns checked)` };

		return {
			status: 'fail',
			summary: `${sorted.length} local function(s) may reinvent a dependency export`,
			rows: collisionRows(sorted),
		};
	},
};
