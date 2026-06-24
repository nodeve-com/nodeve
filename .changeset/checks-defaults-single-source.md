---
'@nodeve/checks': major
---

Single-source the config defaults. `DEFAULTS` is now authored in one place (`defaults.ts`) as a bare `export default {...} satisfies Config` — itself a valid `nodeve.checks.js` — so it doubles as the copyable reference.

- **Breaking:** the package no longer ships `nodeve.checks.example.js`. Scaffold from `node_modules/@nodeve/checks/nodeve.checks.defaults.js` instead (the org defaults verbatim, every key at its real default value), and keep only the keys you change.
- Adds an `@nodeve/checks/defaults` export so the defaults are importable (`import DEFAULTS from '@nodeve/checks/defaults'`).
- `@nodeve/checks/config` still re-exports `DEFAULTS` unchanged.
