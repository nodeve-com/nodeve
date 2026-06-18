#!/usr/bin/env node
/**
 * Commit gate (advisory): flag a locally-declared function whose name fuzzily
 * matches a dependency export — i.e. a likely reinvention of a lib function
 * (e.g. local `clamp255` ≈ remeda `clamp`). Matching is token-set based
 * (`@nodeve/text` `identifierSimilarity`), so transpositions like
 * `byGroup`/`groupBy` are caught where edit-distance fails.
 *
 * Routing a hit is a JUDGEMENT call — delete-and-import, wrap the lib, rename for
 * specificity, or allowlist. BLOCKS by default: any non-allowlisted finding
 * exits 1. `--warn` downgrades to report-only.
 *
 * Matches against the committed lib-names index (`helperCollisions.libNamesPath`,
 * regen with `nodeve-build-lib-names`). The index is committed so the gate has no
 * runtime dependency on the libs being installed.
 */
import { identifierSimilarity } from '@nodeve/text/similarity';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { loadConfig, parseArgs } from '../lib/config.js';
import { gitFiles, repoRoot } from '../lib/repo.js';

const root = repoRoot();
const cfg = (await loadConfig(root)).helperCollisions;
const { paths, warn, verbose } = parseArgs(process.argv.slice(2));
const ALLOWLIST = new Set(cfg.allowlist);

type LibFn = { lib: string; name: string };

function loadLibIndex(): LibFn[] {
	const path = join(root, cfg.libNamesPath);
	// Missing index → no-op (clean), not a crash: a repo that hasn't run
	// `nodeve-build-lib-names` yet shouldn't fail the commit on this advisory gate.
	if (!existsSync(path)) return [];
	const { names } = JSON.parse(readFileSync(path, 'utf8')) as { names: Record<string, string[]> };
	return Object.entries(names).flatMap(([lib, list]) => list.map((name) => ({ lib, name })));
}

function sourceFiles(): string[] {
	const scope = paths.length > 0 ? paths : gitFiles(root, cfg.globs);
	return scope.filter((f) => f.endsWith('.ts') && !/\.(d|test|spec)\.ts$/.test(f));
}

/** Top-level `function` / arrow-const declaration names in a source file. */
function declaredFunctionNames(absPath: string): string[] {
	const src = ts.createSourceFile(
		absPath,
		readFileSync(absPath, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	);
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

function bestMatch(name: string, libIndex: LibFn[]): { lib: LibFn; score: number } | null {
	let best: { lib: LibFn; score: number } | null = null;
	for (const lib of libIndex) {
		const score = identifierSimilarity(name, lib.name);
		if (!best || score > best.score) best = { lib, score };
	}
	return best && best.score >= cfg.threshold ? best : null;
}

const libIndex = loadLibIndex();
type Finding = { name: string; lib: LibFn; score: number; files: Set<string> };
const findings = new Map<string, Finding>();

for (const rel of sourceFiles()) {
	const abs = join(root, rel);
	for (const name of declaredFunctionNames(abs)) {
		const m = bestMatch(name, libIndex);
		if (!m) continue;
		const pairKey = `${name}→${m.lib.name}`;
		if (ALLOWLIST.has(`${rel}::${pairKey}`)) continue;
		const found = findings.get(pairKey) ?? { name, lib: m.lib, score: m.score, files: new Set() };
		found.files.add(rel);
		findings.set(pairKey, found);
	}
}

const sorted = [...findings.values()].sort((a, b) => b.score - a.score);
if (sorted.length === 0) {
	if (verbose) console.log(`helper-collisions: clean (${libIndex.length} lib fns checked)`);
	process.exit(0);
}

console.log(
	`helper-collisions: ${sorted.length} local function(s) may reinvent a dependency export.\n` +
		`Resolve per case — delete + import, wrap the lib, rename for specificity, or allowlist:\n`,
);
for (const f of sorted) {
	console.log(`  ${f.score.toFixed(2)}  ${f.name}  ≈  ${f.lib.lib}.${f.lib.name}`);
	for (const file of f.files) console.log(`            ${file}`);
}

process.exit(warn ? 0 : 1);
