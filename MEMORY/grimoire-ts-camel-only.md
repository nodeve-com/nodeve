---
name: grimoire-ts-camel-only
description: grimoire TS emits are camelCase wall-to-wall — data default export included; snake in .ts = generator bug
metadata:
  node_type: memory
  type: feedback
  originSessionId: e76db73b-0b59-48f0-8740-681533921167
---

Published npm JS/TS surface is camelCase by design — every key in `src/generated/**.ts`: schema const, `type` alias, AND the data `export default` + `DataT`. "Twin of the sibling .json" = same content, never same spelling. snake_case belongs only to YAML + `artifacts/**.json`; JSON Schema ships both casings (`.schema.json` snake + `.camel.schema.json`).

**Why:** agents kept reading the committed snake-keyed generated files + "twin of .json" comments as house style and preserving/emitting snake in TS — drove the user insane. Root cause: `kit/generate.ts` camelizes the schema but passed the data tree raw (code fix pending as of 2026-07-13).

**How to apply:** never write a snake key in a `.ts` file in grimoire; treat any found as a `kit/emit-types.ts`/`generate.ts` bug to fix at the generator, not style to imitate. See [[nodeve-checks]].
