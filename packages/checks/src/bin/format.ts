#!/usr/bin/env node
/**
 * Commit fixer: prettier-format staged files in place, so they land formatted
 * without a manual `prettier --write`. Wired in the shared lefthook config with
 * `stage_fixed: true`, which re-stages whatever this touches.
 *
 * Scope is the lefthook glob's call, not this bin's — it formats whatever paths
 * it's handed. The glob must only name types prettier has a parser for: given a
 * path it can't infer a parser for, prettier errors rather than skipping.
 *
 * WHY a bin instead of `bunx prettier --write` in the hook: the rest of the
 * shared config shells `node_modules/.bin/nodeve-*` so it's portable across pnpm
 * and bun and needs nothing on PATH. `bunx` needs Bun, and under pnpm's strict
 * layout a transitive prettier isn't at the consumer's `node_modules/.bin`. So we
 * bundle prettier as a dependency and resolve ITS cli here — available in every
 * consumer regardless of their own deps.
 *
 * The bundled prettier still honors the consumer's `.prettierrc`/`.prettierignore`
 * and plugins: prettier resolves both relative to each file, not to this bin.
 *
 * Skips symlinks (e.g. CLAUDE.md → README.md): prettier errors on a symlink
 * path, and the real target is formatted via its own staged entry anyway.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstatSync } from 'node:fs';

const argPaths = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const files = argPaths.filter((p) => {
	try {
		return !lstatSync(p).isSymbolicLink();
	} catch {
		// Deleted/renamed out from under us — let prettier's own scope skip it.
		return false;
	}
});

if (files.length === 0) process.exit(0);

const prettierCli = createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs');
const res = spawnSync(process.execPath, [prettierCli, '--write', ...files], { stdio: 'inherit' });

process.exit(res.status ?? 1);
