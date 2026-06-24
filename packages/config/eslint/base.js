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
		},
	},
];

export default base;
