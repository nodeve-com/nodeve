---
name: nodeve-release-flow
description: "nodeve's `release` script is publish-only — run `changeset version` + commit + push before it"
metadata:
  node_type: memory
  type: project
  originSessionId: 0876025f-4fba-4174-be21-ae4b913179da
---

nodeve's root `release` script is only `pnpm build && changeset publish` — it does **NOT** run `changeset version`. So before `pnpm release`, run `pnpm changeset version` (applies the bump, regenerates CHANGELOGs, consumes the changeset files) and commit & push the result. Standard changesets two-step; the repo just leaves `version` manual. See [[nodeve-checks]].
