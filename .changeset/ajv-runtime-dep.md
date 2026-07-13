---
'@nodeve/grimoire': patch
---

Declare `ajv` as a runtime dependency — `dist/ajv.js` imports it, but it was only a devDependency, so consumers resolved whatever ajv their tree hoisted (e.g. eslint's ajv@6, which has no named `Ajv` export).
