/**
 * On by default: eslint is a hard org requirement on every project, so a repo
 * that ships no eslint flat config fails the gate. This check enforces the
 * PRESENCE of the config — the rules themselves (function-naming, `max-params`,
 * `max-lines-per-function`, …) live in `@nodeve/config/eslint` and eslint runs
 * them in the repo's own lint job. Whole-tree property: it looks for a flat
 * config at the repo root (a monorepo lints every package from one root config),
 * so it ignores staged paths. Set `requireEslint: { enforce: false }` to opt out.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Check } from '../lib/runner.js';

/** Flat-config filenames eslint resolves at the project root, in its own lookup order. */
const FLAT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts'];

export const requireEslint: Check<'requireEslint'> = {
	name: 'require-eslint',
	section: 'requireEslint',
	explain: `eslint is required on every org project — the shared rules (function naming,
max-params, max-lines-per-function) only bite where eslint actually runs. Add a
root \`eslint.config.js\` that spreads the org base:

    import { defineConfig } from 'eslint/config';
    import base from '@nodeve/config/eslint/base';
    export default defineConfig(...base);

Install the eslint peers (\`eslint\`, \`@eslint/js\`, \`eslint-config-prettier\`,
\`globals\`, \`typescript-eslint\`) and wire a lint job into the commit gate. Opt a
repo out deliberately with \`requireEslint: { enforce: false }\`.`,

	run({ root, cfg }) {
		if (!cfg.enforce) return { status: 'skip', summary: 'disabled' };
		const found = FLAT_CONFIGS.find((f) => existsSync(join(root, f)));
		if (found) return { status: 'pass', summary: `eslint flat config present (${found})` };
		return {
			status: 'fail',
			summary: 'no eslint flat config at the repo root',
			rows: [`expected one of: ${FLAT_CONFIGS.join(', ')}`],
		};
	},
};
