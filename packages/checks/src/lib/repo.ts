import { execFileSync } from 'node:child_process';

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
