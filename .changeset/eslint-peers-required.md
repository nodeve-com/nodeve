---
'@nodeve/config': patch
---

Make the ESLint peers (`eslint`, `@eslint/js`, `eslint-config-prettier`, `globals`, `typescript-eslint`) required instead of optional. `eslint/base.js` imports them unconditionally, so consumers doing a frozen/CI install (which skips optional peers) hit `ERR_MODULE_NOT_FOUND` at lint time. As required peers, auto-installing package managers (bun) pull them into the consumer lockfile. Svelte-only, prettier-plugin, and vite peers stay optional.
