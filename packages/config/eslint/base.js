import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import ts from 'typescript-eslint';

/**
 * nodeve org-level ESLint base: recommended JS + TS rules, prettier
 * compatibility, browser + node globals, and the org function-naming
 * convention.
 *
 * This is a flat-config array — spread it into your `defineConfig(...)`.
 * Project-specific config (`.gitignore` inclusion via `@eslint/compat`,
 * ignore globs, per-file rule overrides) is composed by the consumer.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
const base = [
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			'no-undef': 'off',
			// Forward guardrail: no anonymous function *expressions* (`const f =
			// function () {}` → name it). Note: does NOT govern arrow functions (no
			// ESLint option does); inline callback arrows stay legal.
			'func-names': ['error', 'always'],
			'max-depth': ["error", 3],
			// >3 params must collapse into a single typed options object — past three
			// positional args the call site stops reading and every reorder is a silent bug.
			'max-params': ['error', 3],
			'max-lines-per-function': ['error', { max: 35, skipBlankLines: true, skipComments: true }],
		},
	},
	{
		// Test files: a `describe`/`it` callback is a suite, not a unit of logic — its
		// length tracks the number of cases, not a split-worthy responsibility. The
		// length budget doesn't apply; everything else (naming, params) still does.
		files: ['**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}', '**/*.test-d.ts'],
		rules: { 'max-lines-per-function': 'off' },
	},
];

export default base;
