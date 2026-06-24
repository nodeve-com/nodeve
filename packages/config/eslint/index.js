import base from './base.js';

/**
 * Org base plus Svelte-stack guardrails.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
const config = [
	...base,
	// Force deep per-icon imports. The `@lucide/svelte` barrel re-exports all
	// ~1700 icons, so a single named import (even `import type`) pulls every
	// icon's declaration file into the TS program — ballooning the
	// svelte-language-server to ~10k files and pinning a core. No allowTypeImports.
	{
		rules: {
			'@typescript-eslint/no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@lucide/svelte',
							message:
								'Import the specific icon: `import XIcon from "@lucide/svelte/icons/x"`. The barrel pulls all ~1700 icons into the TS program and pins the Svelte LSP at 100% CPU.',
						},
					],
				},
			],
		},
	},
];

export default config;
