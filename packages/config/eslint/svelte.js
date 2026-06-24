import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';

/**
 * SvelteKit-app ESLint wiring shared across nodeve sister repos: svelte
 * recommended + prettier compatibility, and the type-aware `.svelte` parser
 * block (`projectService`, the svelte parser, `extraFileExtensions`).
 *
 * Adds only the Svelte stack — compose it AFTER your org base/index config,
 * which supplies the JS/TS recommended sets, prettier, globals, and the
 * func-names / lucide-barrel guardrails. Returns a flat-config array; spread it
 * into `defineConfig(...)`.
 *
 * `tsconfigRootDir` is load-bearing here (unlike a plain node config): the
 * `.svelte` block turns on `projectService`, so type-aware linting needs the
 * app's own dir as the tsconfig root.
 *
 * Storybook is intentionally NOT included — only some apps use it, so they
 * append `eslint-plugin-storybook`'s flat config themselves rather than pull it
 * in as a peer of every consumer.
 *
 * @param {object} opts
 * @param {object} opts.svelteConfig       the app's `svelte.config.js`
 * @param {string} opts.importMetaDirname  the app's `import.meta.dirname`
 * @param {string} [opts.gitignore]        a `.gitignore` to honor, resolved
 *   against `importMetaDirname` (e.g. `'.gitignore'`). Omit when an ancestor
 *   config already includes the relevant ignore file.
 * @returns {import('typescript-eslint').ConfigArray}
 */
export default function svelteApp({ svelteConfig, importMetaDirname, gitignore }) {
	return [
		...(gitignore ? [includeIgnoreFile(path.resolve(importMetaDirname, gitignore))] : []),
		...svelte.configs.recommended,
		...svelte.configs.prettier,
		{
			languageOptions: {
				parserOptions: { tsconfigRootDir: importMetaDirname },
			},
		},
		{
			files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
			languageOptions: {
				parserOptions: {
					projectService: true,
					extraFileExtensions: ['.svelte'],
					parser: ts.parser,
					svelteConfig,
				},
			},
		},
	];
}
