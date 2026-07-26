---
name: nodeve-release-flow
description: 'nodeve releases via Changesets — CI-driven OIDC Trusted Publishing (release.yml); local `pnpm release` is publish-only fallback'
metadata:
  node_type: memory
  type: project
  originSessionId: 0876025f-4fba-4174-be21-ae4b913179da
  modified: 2026-07-26T19:05:00.000Z
---

**Primary path: CI-driven via `.github/workflows/release.yml`** — `changesets/action` on push to main. Pending `.changeset/*.md` → it opens/refreshes a "Version Packages" PR (bumps versions, writes CHANGELOGs, consumes the changesets); merging that PR (no changesets left) → runs `pnpm release` (`pnpm build && changeset publish`) and publishes changed packages.

Auth is **npm Trusted Publishing (OIDC)** — the job has `id-token: write` and pnpm@11 does the token exchange; **no `NPM_TOKEN` secret, no local login**. This replaces the old local `npm login && pnpm login` dance (which hit E401 daily because web-login mints a session token that expires ~daily). Trusted publishers are **per-package** on npmjs.org (registered as repo `nodeve-com/nodeve` + workflow `release.yml`, blank environment) — an unregistered scoped package falls back to needing a token. Strategic driver: npm's 2FA-bypass tokens lose direct-publish ~Jan 2027 (npm v12 changelog), so OIDC is the future-proof route.

**Auto-merge closes the loop (no human clicks "merge").** The same run that opens/updates the Version PR then merges it via the "Merge the Version Packages PR" step: `gh pr merge "$PR" --auto --squash || gh pr merge "$PR" --squash`. `--auto` waits for required checks; GitHub _rejects_ `--auto` on an already-"clean" PR (main has no required status checks), so the `|| --squash` fallback lands it directly (fix `aa509d9`). Merge is **PAT-authored** (checkout uses `RELEASE_PAT`; changesets/action's `GITHUB_TOKEN` env is also the PAT) so the merge re-triggers `release.yml` → publish branch. GITHUB_TOKEN-authored merge would NOT re-trigger (recursion guard).

**Local fallback:** root `release` script is only `pnpm build && changeset publish` — it does **NOT** run `changeset version`. To publish by hand, first `pnpm changeset version` (applies bump, regenerates CHANGELOGs, consumes changeset files), commit, then `pnpm release`. See [[nodeve-checks]].

**Grimoire JSON artifacts bake inside `release.yml`** (2026-07-17) — the "Attach grimoire JSON artifacts" step, gated on `steps.changesets.outputs.published == 'true'` and `@nodeve/grimoire` appearing in `publishedPackages`. It runs `pnpm --filter @nodeve/grimoire generate`, tars `packages/grimoire/artifacts`, then `gh release upload`s to the `@nodeve/grimoire@<v>` release. The codegen's workspace deps (@nodeve/schema-case, encoding `dist/`) survive because `pnpm release` already ran `pnpm build`. It sits here rather than in a tag-triggered workflow because changesets tags with `GITHUB_TOKEN`, and GitHub suppresses workflow triggers on `GITHUB_TOKEN`-authored events. Deleting the standalone `grimoire-json.yml` cost nothing. The bake runs in the publish job on the main commit, so its tag-trigger gotchas (re-push to re-fire, checkout-the-tag-tree) do not apply.

**`pnpm release` runs the ROOT build first, so ANY package's broken build blocks every publish** (2026-07-26). grimoire's `kit/generate.ts` had failed since before `8b539a6`: refrigerant enum docs cite a `mass_fraction` prop with no backing property doc. `pnpm build` died there and took local AND CI releases with it. The symptom reads as a grimoire error; the effect is that nothing publishes. Root `build` filters it out — `pnpm -r --if-present --filter '!@nodeve/grimoire' build` (`4568fa4`). grimoire keeps its source and its published 4.11.0, and gates nobody. See [[grimoire-ignored]].

**The release runner needs uv, and a package `build` must not be its gate** (2026-07-26). @nodeve/schema projects gen/ through `uvx --from linkml`. uv ships in the nix devShell and on no runner, so the publish run died at `uvx: not found` — `astral-sh/setup-uv` covers it. schema's `build` also ran its full `check`, which wants postgres the runner lacks; `build` is now `fix && project && tsc`, and `check` stays the commit gate. A package `build` owes the release its artifacts, nothing else.

**Bootstrapping a NEW package name** (`@nodeve/schema@0.1.0`, 2026-07-26): the first version went out by hand — `npm login` then root `pnpm release`, which publishes only versions npm lacks and leaves pending changesets unconsumed. **npm's read path lags the write by minutes on a first publish**: `npm view` and `registry.npmjs.org/@scope%2fname` return 404 (cache-buster and all) while the publish has already landed. Confirm with the npm publish email or `npm access list packages @nodeve` — never conclude from `npm view` that a fresh publish failed.
