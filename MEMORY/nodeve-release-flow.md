---
name: nodeve-release-flow
description: 'nodeve releases via Changesets — CI-driven OIDC Trusted Publishing (release.yml); local `pnpm release` is publish-only fallback'
metadata:
  node_type: memory
  type: project
  originSessionId: 0876025f-4fba-4174-be21-ae4b913179da
  modified: 2026-07-19T10:07:12.801Z
---

**Primary path: CI-driven via `.github/workflows/release.yml`** — `changesets/action` on push to main. Pending `.changeset/*.md` → it opens/refreshes a "Version Packages" PR (bumps versions, writes CHANGELOGs, consumes the changesets); merging that PR (no changesets left) → runs `pnpm release` (`pnpm build && changeset publish`) and publishes changed packages.

Auth is **npm Trusted Publishing (OIDC)** — the job has `id-token: write` and pnpm@11 does the token exchange; **no `NPM_TOKEN` secret, no local login**. This replaces the old local `npm login && pnpm login` dance (which hit E401 daily because web-login mints a session token that expires ~daily). Trusted publishers are **per-package** on npmjs.org (registered as repo `nodeve-com/nodeve` + workflow `release.yml`, blank environment) — every scoped package must be registered or its publish falls back to needing a token. Strategic driver: npm's 2FA-bypass tokens lose direct-publish ~Jan 2027 (npm v12 changelog), so OIDC is the future-proof route.

**Auto-merge closes the loop (no human clicks "merge").** The same run that opens/updates the Version PR then merges it via the "Merge the Version Packages PR" step: `gh pr merge "$PR" --auto --squash || gh pr merge "$PR" --squash`. `--auto` waits for required checks; GitHub _rejects_ `--auto` on an already-"clean" PR (main has no required status checks), so the `|| --squash` fallback lands it directly (fix `aa509d9`). Merge is **PAT-authored** (checkout uses `RELEASE_PAT`; changesets/action's `GITHUB_TOKEN` env is also the PAT) so the merge re-triggers `release.yml` → publish branch. GITHUB_TOKEN-authored merge would NOT re-trigger (recursion guard).

**Local fallback:** root `release` script is only `pnpm build && changeset publish` — it does **NOT** run `changeset version`. To publish by hand, first `pnpm changeset version` (applies bump, regenerates CHANGELOGs, consumes changeset files), commit, then `pnpm release`. See [[nodeve-checks]].

**Grimoire JSON artifacts bake inside `release.yml`** (2026-07-17) — the "Attach grimoire JSON artifacts" step, gated on `steps.changesets.outputs.published == 'true'` and `@nodeve/grimoire` appearing in `publishedPackages`. It runs `pnpm --filter @nodeve/grimoire generate`, tars `packages/grimoire/artifacts`, and `gh release upload`s to the `@nodeve/grimoire@<v>` release changesets/action just created. The codegen's workspace deps (@nodeve/schema-case, encoding `dist/`) are present because `pnpm release` already ran `pnpm build`. Folded in here (not a separate tag-triggered workflow) precisely because changesets tags with `GITHUB_TOKEN` and GitHub suppresses workflow triggers on `GITHUB_TOKEN`-authored events, so a `on: push: tags` workflow can't fire on a CI release. The old standalone `grimoire-json.yml` was **deleted** — its tag-trigger gotchas (re-push to re-fire, checkout-the-tag-tree) no longer apply since the bake now runs in the publish job on the main commit.
