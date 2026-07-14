import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Absolute path to the enclosing git work tree. Every check resolves its scope
 * and reads against this, so a check behaves the same no matter which cwd the
 * hook runner (or a developer) invokes it from.
 */
export function repoRoot(): string {
	return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

/**
 * Tracked files matching any of `globs` (git pathspecs, repo-root-relative).
 * git pathspec `*` matches `/`, so `apps/*.ts` recurses into subdirs. Returns
 * `[]` for an empty glob list — an unconfigured opt-in check then no-ops.
 * `git ls-files` still lists index-tracked paths deleted from the working tree
 * (an unstaged delete — e.g. a regen dropped a generated file); those are gone
 * on disk, so a working-tree scan skips them rather than crashing on the read.
 */
export function gitFiles(root: string, globs: string[], ignore: string[] = []): string[] {
	if (globs.length === 0) return [];
	const out = execFileSync('git', ['ls-files', ...globs], { cwd: root, encoding: 'utf8' });
	const drop = globMatcher(ignore);
	return out.split('\n').filter((f) => f && !drop(f) && existsSync(join(root, f)));
}

/**
 * A predicate matching a repo-relative path against any of `patterns`. `**` spans path
 * separators (`generated/**` drops the whole subtree), `*`/`?` stay within one segment. The
 * single `ignore`-glob semantics every scoped check shares — defined once, used by every
 * file-listing path (`gitFiles`, `tsSources`, the length engine).
 */
export function globMatcher(patterns: string[]): (rel: string) => boolean {
	if (patterns.length === 0) return () => false;
	const res = patterns.map(globRegex);
	return (rel) => res.some((r) => r.test(rel));
}

function globRegex(pattern: string): RegExp {
	let source = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i]!;
		if (char === '*' && pattern[i + 1] === '*') {
			i++;
			if (pattern[i + 1] === '/') i++;
			source += '.*';
		} else if (char === '*') source += '[^/]*';
		else if (char === '?') source += '[^/]';
		else source += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
	}
	return new RegExp(`^${source}$`);
}

/**
 * Visible line count of a repo-root-relative file — matches `wc -l` and the
 * editor's line count, since prettier writes a trailing newline so the final
 * split segment is empty. Shared by the line-budget gates.
 */
export function lineCount(root: string, path: string): number {
	return readFileSync(join(root, path), 'utf8').split('\n').length - 1;
}

/**
 * Total changed lines (insertions + deletions) across the staged diff — what a
 * commit is about to record. Binary files report `-`/`-` in numstat and count as
 * zero. Used by the commit-msg gate to size a change before deciding a body is owed.
 */
export function stagedDiffLines(root: string): number {
	const out = execFileSync('git', ['diff', '--cached', '--numstat'], {
		cwd: root,
		encoding: 'utf8',
	});
	let total = 0;
	for (const line of out.split('\n')) {
		if (!line) continue;
		const [added, deleted] = line.split('\t');
		total += (Number(added) || 0) + (Number(deleted) || 0);
	}
	return total;
}

export type Catalog = Record<string, string>;
export type Workspace = {
	packages: string[];
	catalog: Catalog;
	catalogs: Record<string, Catalog>;
};

/**
 * Resolve the workspace definition from whichever manifest the repo uses:
 * `pnpm-workspace.yaml` (pnpm) takes precedence, else the root
 * `package.json#workspaces` (Bun, where `workspaces` may be a bare array of
 * globs or an object carrying the catalogs). Returns `null` when neither exists.
 */
export function readWorkspace(root: string): Workspace | null {
	const pnpm = join(root, 'pnpm-workspace.yaml');
	if (existsSync(pnpm)) {
		const ws = parseYaml(readFileSync(pnpm, 'utf8')) ?? {};
		return { packages: ws.packages ?? [], catalog: ws.catalog ?? {}, catalogs: ws.catalogs ?? {} };
	}
	const pkgPath = join(root, 'package.json');
	if (existsSync(pkgPath)) {
		const ws = JSON.parse(readFileSync(pkgPath, 'utf8')).workspaces;
		if (Array.isArray(ws)) return { packages: ws, catalog: {}, catalogs: {} };
		if (ws && typeof ws === 'object') {
			return {
				packages: ws.packages ?? [],
				catalog: ws.catalog ?? {},
				catalogs: ws.catalogs ?? {},
			};
		}
	}
	return null;
}

/**
 * Tracked `package.json` files the package manager installs from: every
 * workspace package plus the root manifest. Package globs honor their `!`
 * negations (workspace `*` matches `/` in git pathspecs, same as pnpm/bun
 * resolution); the root is always included, since its own deps — the shared
 * tooling devDeps especially — must obey the same org rules as any package.
 */
export function workspaceManifests(root: string, ws: Workspace): string[] {
	const positives = ws.packages.filter((p) => !p.startsWith('!'));
	const negatives = ws.packages
		.filter((p) => p.startsWith('!'))
		.map((p) => p.slice(1).replace(/\/\*+$/, ''));
	const packages = gitFiles(
		root,
		positives.map((p) => `${p}/package.json`),
	).filter((manifest) => {
		const dir = dirname(manifest);
		return !negatives.some((n) => dir === n || dir.startsWith(n + '/'));
	});
	return [...new Set([...gitFiles(root, ['package.json']), ...packages])];
}
