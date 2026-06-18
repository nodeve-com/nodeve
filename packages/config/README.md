# @nodeve/config

Shared TypeScript and Prettier configuration for nodeve and sister projects.

Direction: Bun + ES2023, NodeNext resolution. platform will migrate onto this
incrementally.

## TypeScript

```jsonc
// tsconfig.json
{
  "extends": "@nodeve/config/tsconfig",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

The shared config is pure `compilerOptions` (no `outDir`/`rootDir`/`include`),
so paths resolve relative to the extending project.

## Prettier

```js
// prettier.config.js — base (no plugins)
export { default } from '@nodeve/config/prettier/base';
```

```js
// prettier.config.js — with Svelte + Tailwind plugins
export { default } from '@nodeve/config/prettier';
```

The plugin variant (`./prettier`) lists `prettier-plugin-svelte` and
`prettier-plugin-tailwindcss` as optional peers — install them where used.
