---
name: nodeve-release-flow
description: "nodeve's `release` script is publish-only — run `changeset version` + commit + push before it"
metadata:
  node_type: memory
  type: project
  originSessionId: 0876025f-4fba-4174-be21-ae4b913179da
---

nodeve's root `release` script is only `pnpm build && changeset publish` — it does **NOT** run `changeset version`. So before `pnpm release`, run `pnpm changeset version` (applies the bump, regenerates CHANGELOGs, consumes the changeset files) and commit & push the result. Standard changesets two-step; the repo just leaves `version` manual. See [[nodeve-checks]].

**GitHub release is automated but tag-triggered.** `.github/workflows/grimoire-json.yml` bakes the JSON artifacts and creates the GH release on push of a `@nodeve/grimoire@*` tag. Gotchas (all fixed 2026-07-13): (1) re-pushing a tag that already exists on the remote fires NO event — to (re)trigger, `git push origin :refs/tags/<tag>` then push it again; (2) the workflow checks out the tag's tree, so any CI fix must be in the tagged commit (move the tag if needed — npm tarball is unaffected by tag position); (3) CI must `pnpm -r build` the workspace deps before `grimoire generate` (codegen imports @nodeve/schema-case + encoding from dist/), and root `prepare` is guarded `lefthook install || true` (lefthook is dev-only).
