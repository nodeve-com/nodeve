# @nodeve/config

## 0.2.0

### Minor Changes

- Add shared ESLint flat config. `@nodeve/config/eslint/base` provides the org-level defaults (recommended JS + TS rules, prettier compatibility, browser + node globals, the `func-names` convention); `@nodeve/config/eslint` layers the Svelte-stack `@lucide/svelte` barrel-import ban on top. ESLint peers (`eslint`, `@eslint/js`, `eslint-config-prettier`, `globals`, `typescript-eslint`) are optional.

## 0.1.0

### Minor Changes

- b92cff5: Initial release: shared TypeScript (`@nodeve/config/tsconfig`) and Prettier (`@nodeve/config/prettier`, `@nodeve/config/prettier/base`) configuration for nodeve and sister projects.
