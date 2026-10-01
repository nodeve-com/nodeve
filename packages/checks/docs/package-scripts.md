# Package script contract

Three verbs, three jobs. Every workspace package names its scripts by what they _do_, so the org gate and CI recurse over them uniformly (`pnpm -r` / `bun run --filter '*'`). A package opts a verb out by not defining that script.

## The verbs

| Verb | Confirms | Runs | Cargo analog |
| - | - | - | - |
| `check` | the source is valid **as written** — types, schema validation, authoring/semantic gates, baseline rules. Never rewrites an authored file. | commit gate | `cargo check` |
| `build` | everything **generates + compiles cleanly** — rewrites derived sources, then produces the shipped artifacts. | CI / release | `cargo build` |
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
| - | - | - | - |
| encoding / text / schema-case | `tsc --noEmit` | `tsc` emit | `vitest run` |
| checks | `tsc --noEmit` | `tsc` emit | — |
| schema | drift gates → `project` → shape gate → SQLite FK → `tsc --noEmit` | `fix && check` | `vitest run` |

### Projecting inside `check`

A `check` may write **derived** files when validation reads them — @nodeve/schema projects its JSON Schema, DDL, and TS types into gitignored `gen/`, then validates rows against them. That keeps `check` standalone — it needs no committed artifact, and a fresh clone gates correctly.

The line it must not cross is **rewriting an authored file**. Put those rewrites in `fix` and have `build` run `fix` before `check`. A drift gate that ran after its own generator would assert against fresh output and never fail.

### Keep the gate in the package

A package's gate belongs in its `check` script, not a job in the consuming repo's `lefthook.yml`. The `package-check` recursion finds it wherever the package sits, so it travels intact when the package moves to another repo or spins out into its own. Root `lefthook.yml` is for facts about the _repo_ — nothing per-package.

## How the gate uses them

The shared `lefthook.checks.yml` runs one `package-check` job → the `check` of each package the commit touches (a staged path's nearest `package.json`). PM-agnostic (lockfile-detected). A touched package runs its whole `check`: a typecheck needs the whole package program. An untouched package never blocks a commit; `pnpm -r check` covers the whole tree. `build` and `test` are heavier and belong in CI, not the per-commit gate.

Opt-out is by omission — no `check` script, no run. A frozen/legacy package (e.g. grimoire) parks its script under a non-verb name (`check:frozen`) so the recursion skips it.
