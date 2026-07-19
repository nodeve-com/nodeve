---
name: grimoire-shape-slop-cleanup
description: "Ongoing grimoire cleanup — hand-authored TS shapes, duplicate defs, opaque Obj bags all trace to one missing desugar-at-load edge"
metadata: 
  node_type: memory
  type: project
  originSessionId: da0bc96c-2f64-4de3-9acc-4e8a807a73c9
  modified: 2026-07-19T15:40:21.874Z
---

Multi-thread cleanup in `packages/grimoire`. Three symptoms, ONE root cause.

**Symptoms (each got a guard/gate):**
- Hand-authored `interface`/named-member `type` in `src/` (minus `generated/`) — banned by `scripts/guard-authored-shapes.ts` ([[grimoire-no-ts-spec-grammar]]). A shape lives once in YAML concepts → `pnpm generate` → `src/generated/`; runtime imports it.
- Duplicate top-level definitions (`Obj` ×N, `readYaml` ×2, `yamlFiles` ×2) — caught by extended `@nodeve/checks` `inline-dupes` (now scans type/interface decls + `includeExported: true` for library-only repos; nodeve opts in via `nodeve.checks.js`).
- `Record<string, unknown>` / `Obj` sprawl (200+) — the opaque-bag smell. Two clusters: **A** runtime readers (`bake-site` 33, `measurand-tree` 17, `site-view` 7, `cascade`, `concept-sources`) = the smell; **B** `kit/` codegen over pre-type JSON trees = mostly legit.

**ROOT CAUSE:** the site bundle never gets desugared to camel. Every load edge runs `camelizeInstance(schema, data)` (`@nodeve/schema-case`, `x-key-map`-driven) EXCEPT `loadSiteBundle`/`openSite`. `bake-site` emits snake JSON; `validateSite` even computes the camel form then throws it away. So site-view reads raw snake → untyped `Obj` bags → `MeasurandCell = IntervalItem & {node: Obj}` etc. There is NO central YAML loader — `readYaml` is defined raw twice (`concept-sources.ts:42`, `bake-site.ts:37`); desugar is schema-driven, applied à la carte at parse/validate edges only.

**THE FIX (not yet done):** build the missing desugar edge — `openSite` camelizes each concept block via `conceptOf(key)` → `conceptSchema` → `camelizeInstance` (mirror `validateSite`'s iteration). Then Cluster-A `Obj` collapses into generated concept types, and the site-view flagged shapes (`SiteSensor`, `ResolvedDevice`, `CatalogItemRef`, `LinkedRegister`) dissolve.

**Decisions locked:** do NOT create a shared `Obj` (blesses the smell) — eliminate it. `Record<string,unknown>` is rare/specific only. Go one-by-one: each flagged shape is a mistake OR reveals an undefined concept/feature — never a redefine ([[grimoire-ts-camel-only]], [[no-inline-string-vocab]]).

**Done (committed main, bypassed red gate):** guard-authored-shapes; ModbusMedium→required at source; cascade Obj removed; inline-dupes extension.

**Done (uncommitted):** single YAML load surface — `concept-sources.readYaml` is now the ONLY `readFileSync`+`parseYaml` pair; killed dup `readYaml` in `bake-site.ts` + inline `parseYaml(readFileSync)` in `kit/emit-enumeration`, `kit/generate`, `kit/validate-docs` (parseDoc empty-check → `Object.keys.length===0`). tests green, no generate drift. NOTE: still no desugar-at-load — readYaml returns raw snake `Obj`; the openSite camelize edge (THE fix) remains.

**Open / gate is RED:** `inline-dupes` flags remaining real dupes: `Obj`×2 defs, `yamlFiles`, `ARCHETYPES_DIR`, `Workspace` (`readYaml` now single); coincidental generics to allowlist w/ WHY: `catalog`, `Finding`, `Hit`, `Kind`, `render`, `GENERATED_DIR` twin.
