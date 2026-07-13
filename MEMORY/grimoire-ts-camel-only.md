---
name: grimoire-ts-camel-only
description: grimoire TS emits are camelCase wall-to-wall — authored-data named exports included; snake in .ts = generator bug
metadata:
  node_type: memory
  type: feedback
  originSessionId: e76db73b-0b59-48f0-8740-681533921167
---

Published npm JS/TS surface is camelCase by design — every key in `src/generated/**.ts`: schema const, `type` alias, AND the authored-data named exports + `DataT`. "Twin of the sibling .json" = same content, never same spelling. snake_case belongs only to YAML + `artifacts/**.json`; JSON Schema ships both casings (`.schema.json` snake + `.camel.schema.json`).

**Why:** agents kept reading the committed snake-keyed generated files + "twin of .json" comments as house style and preserving/emitting snake in TS — drove the user insane. Fixed 2026-07-13 (056f22e): every emitter camelizes keys (aggregate index, catalog entries, vocab dicts); wire slugs/codes rename at the lookup edge (`conceptOf`, vocab re-keyed by `.code`); `guard-generated-camel` now runs in the pre-commit `grimoire-generate` lefthook job, which also regenerates + re-stages.

**How to apply:** never write a snake key in a `.ts` file in grimoire; treat any found as a `kit/emit-*.ts` bug to fix at the generator, not style to imitate. Runtime lookups arriving with wire (snake) slugs/codes rename at the edge, never by keeping snake keys. See [[nodeve-checks]].
