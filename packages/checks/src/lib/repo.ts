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
 */
export function gitFiles(root: string, globs: string[]): string[] {
	if (globs.length === 0) return [];
	const out = execFileSync('git', ['ls-files', ...globs], { cwd: root, encoding: 'utf8' });
	return out.split('\n').filter(Boolean);
}

/**
 * Visible line count of a repo-root-relative file — matches `wc -l` and the
 * editor's line count, since prettier writes a trailing newline so the final
 * split segment is empty. Shared by the line-budget gates.
 */
export function lineCount(root: string, path: string): number {
	return readFileSync(join(root, path), 'utf8').split('\n').length - 1;
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
			return { packages: ws.packages ?? [], catalog: ws.catalog ?? {}, catalogs: ws.catalogs ?? {} };
		}
	}
	return null;
}

/**
 * Tracked `package.json` files for every workspace package, honoring the
 * workspace globs' `!` negations — so callers see exactly the set the package
 * manager installs. (Workspace `*` matches `/` in git pathspecs, same as
 * pnpm/bun resolution.)
 */
export function workspaceManifests(root: string, ws: Workspace): string[] {
	const positives = ws.packages.filter((p) => !p.startsWith('!'));
	const negatives = ws.packages
		.filter((p) => p.startsWith('!'))
		.map((p) => p.slice(1).replace(/\/\*+$/, ''));
	return gitFiles(
		root,
		positives.map((p) => `${p}/package.json`),
	).filter((manifest) => {
		const dir = dirname(manifest);
		return !negatives.some((n) => dir === n || dir.startsWith(n + '/'));
	});
}
