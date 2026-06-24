# @nodeve/config

Shared TypeScript, Prettier, and ESLint configuration for nodeve and sister projects.

Direction: Bun + ES2023, NodeNext resolution. platform will migrate onto this incrementally.

## TypeScript

```jsonc
// tsconfig.json
{
	"extends": "@nodeve/config/tsconfig",
	"compilerOptions": {
		"outDir": "dist",
		"rootDir": "src",
	},
	"include": ["src"],
}
```

The shared config is pure `compilerOptions` (no `outDir`/`rootDir`/`include`), so paths resolve relative to the extending project.

## Prettier

```js
// prettier.config.js — base (no plugins)
export { default } from '@nodeve/config/prettier/base';
```

```js
// prettier.config.js — with Svelte + Tailwind plugins
export { default } from '@nodeve/config/prettier';
```

The plugin variant (`./prettier`) lists `prettier-plugin-svelte` and `prettier-plugin-tailwindcss` as optional peers — install them where used.

## ESLint

Both exports are flat-config arrays. Spread them into your `defineConfig(...)` and compose project-specific config (`.gitignore` inclusion, ignore globs, per-file overrides) around them.

```js
// eslint.config.js — org base only
import { defineConfig } from 'eslint/config';
import base from '@nodeve/config/eslint/base';

export default defineConfig(...base);
```

```js
// eslint.config.js — base + Svelte-stack guardrails
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import { defineConfig } from 'eslint/config';
import nodeve from '@nodeve/config/eslint';

export default defineConfig(
	includeIgnoreFile(path.resolve(import.meta.dirname, '.gitignore')),
	...nodeve,
);
```

`./eslint/base` gives the recommended JS + TS rules, prettier compatibility, browser + node globals, and the org function-naming convention. `./eslint` adds the Svelte-stack `@lucide/svelte` barrel-import ban on top.

The ESLint peers (`eslint`, `@eslint/js`, `eslint-config-prettier`, `globals`, `typescript-eslint`) are optional — install them where you consume an eslint export.

## Vite

`@nodeve/config/vite` exports `vitestProjects()` — the SvelteKit browser/node test-project split (`*.svelte.{test,spec}` under Playwright + a node project for the rest) that `sv create` scaffolds identically into every app. Centralizing it keeps the two in lockstep and out of the copy-paste gate.

```js
// vite.config.ts
import { vitestProjects } from '@nodeve/config/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: { expect: { requireAssertions: true }, projects: vitestProjects() },
});
```

Both projects `extends: './vite.config.ts'` (override via `vitestProjects({ extends })`). An app with an extra project keeps it per-app: `projects: [...vitestProjects(), storybookProject]`. `@vitest/browser-playwright` is an optional peer — install it where consumed.
