# Package script contract

Three verbs, three jobs. Every workspace package names its scripts by what they _do_, so the org gate and CI recurse over them uniformly (`pnpm -r` / `bun run --filter '*'`). A package opts a verb out by not defining that script.

## The verbs

| Verb | Confirms | Runs | Cargo analog |
| --- | --- | --- | --- |
| `check` | the source is valid **as written** — types, schema validation, authoring/semantic gates, baseline rules. No codegen, no execution. | commit gate | `cargo check` |
| `build` | everything **generates + compiles cleanly** — codegen, schema projections, `tsc` emit. Produces artifacts. | CI / release | `cargo build` |
| `test` | the built output **produces the expected result** — executable tests. | CI | `cargo test` |

## Ordering

`check` → `build` → `test`. `check` is independent and cheapest (static only), so it guards every commit. `test` presupposes `build` — you can't run what hasn't compiled — so both run in CI, `build` first. Same reason Rust splits `check` (type-check, no codegen) from `build`/`test` (full compile): `cargo test` compiles before it runs.

## What goes in `check`

`check` is the **static-verification cluster**, not just the typecheck — the typecheck is one member:

- **typecheck** — `tsc -p tsconfig.json --noEmit` (or `svelte-check`).
- **schema validation** — the shape/grammar gates (e.g. `@nodeve/schema`'s `check:format`, `check:prefixes`).
- **authoring / semantic errors** — content the author must get right (e.g. `check:meta`: every enum value carries an external mapping).
- **baseline rules** — repo-wide invariants.

A leaf package's cluster is often just the typecheck; a source-of-truth package layers in more. Examples:

| Package | `check` | `build` | `test` |
| --- | --- | --- | --- |
| encoding / text / schema-case | `tsc --noEmit` | `tsc` emit | `vitest run` |
| checks | `tsc --noEmit` | `tsc` emit | — |
| schema | `check:format && check:prefixes && … && tsc --noEmit` | `generate` + projections | `vitest run` |

## How the gate uses them

The shared `lefthook.checks.yml` runs one recursive `package-check` job → each package's `check`. PM-agnostic (lockfile-detected) and staged-file-blind: a typecheck needs the whole package program, so staged paths can't narrow it. `build` and `test` are heavier and belong in CI, not the per-commit gate.

Opt-out is by omission — no `check` script, no run. A frozen/legacy package (e.g. grimoire) parks its script under a non-verb name (`check:frozen`) so the recursion skips it.
