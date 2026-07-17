# @nodeve/config

## 0.5.1

### Patch Changes

- d696ef4: Make the ESLint peers (`eslint`, `@eslint/js`, `eslint-config-prettier`, `globals`, `typescript-eslint`) required instead of optional. `eslint/base.js` imports them unconditionally, so consumers doing a frozen/CI install (which skips optional peers) hit `ERR_MODULE_NOT_FOUND` at lint time. As required peers, auto-installing package managers (bun) pull them into the consumer lockfile. Svelte-only, prettier-plugin, and vite peers stay optional.

## 0.5.0

### Minor Changes

- 55c73e1: Ship the org function-shape rules that were already written but never released: `max-depth` (3), `max-params` (3), and `max-lines-per-function` (35, off for test files). They landed in the eslint base after the 0.4.1 cut, so every consumer on 0.4.1 got `func-names` and nothing else. Expect new lint failures on adoption — that's the rules working.

## 0.4.1

### Patch Changes

- da98d96: Ship type declarations for the `./vite` subpath. `vitestProjects` is imported into apps' `vite.config.ts` (a type-checked TS file), so the missing `.d.ts` + `types` export condition surfaced as an implicit-`any` error under `svelte-check`/`tsc`. Adds `vite/index.d.ts` and a `types` condition to the `./vite` export.

## 0.4.0

### Minor Changes

- Add `@nodeve/config/vite`: `vitestProjects()`, the SvelteKit browser/node vitest project split that `sv create` scaffolds identically into every app. Centralizing it keeps the two projects in lockstep and removes the copy-paste each app's vite config otherwise carries. `@vitest/browser-playwright` is an optional peer.

## 0.3.0

### Minor Changes

- 9b48459: Add `@nodeve/config/eslint/svelte`: a SvelteKit-app ESLint factory (svelte recommended + prettier compat + the type-aware `.svelte` parser block) for uniform Svelte linting across nodeve sister repos. Compose it after the base/index config; storybook stays app-side.

## 0.2.0

### Minor Changes

- Add shared ESLint flat config. `@nodeve/config/eslint/base` provides the org-level defaults (recommended JS + TS rules, prettier compatibility, browser + node globals, the `func-names` convention); `@nodeve/config/eslint` layers the Svelte-stack `@lucide/svelte` barrel-import ban on top. ESLint peers (`eslint`, `@eslint/js`, `eslint-config-prettier`, `globals`, `typescript-eslint`) are optional.

## 0.1.0

### Minor Changes

- b92cff5: Initial release: shared TypeScript (`@nodeve/config/tsconfig`) and Prettier (`@nodeve/config/prettier`, `@nodeve/config/prettier/base`) configuration for nodeve and sister projects.
