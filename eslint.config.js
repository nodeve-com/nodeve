import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import { defineConfig, globalIgnores } from 'eslint/config';
import base from '@nodeve/config/eslint/base';

/**
 * nodeve's own eslint gate — the org base (function-naming, max-params,
 * max-lines-per-function, recommended JS/TS + prettier). nodeve has no Svelte, so
 * it takes `/eslint/base` rather than the `@lucide/svelte`-guarded `/eslint`.
 * `.gitignore` supplies most ignores; the extras are machine output no human edits.
 */
export default defineConfig(
	includeIgnoreFile(path.resolve(import.meta.dirname, '.gitignore')),
	globalIgnores([
		'**/src/generated/**', // grimoire codegen output
		'**/nodeve.checks.defaults.js', // built copy of checks defaults
	]),
	...base,
);
