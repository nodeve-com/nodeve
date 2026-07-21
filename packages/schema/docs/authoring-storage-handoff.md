# Authoring/storage split — next-thread handoff

## Start here

Read, in order:

1. repository `README.md`
2. `packages/schema/CLAUDE.md`
3. `packages/schema/docs/levels.md`
4. this document

Inspect the worktree before editing. It contains broad uncommitted schema work.
Preserve unrelated changes. No commit from the node-path discussion was made.

## Problem

Current device-model YAML tries to be all three:

- ergonomic authored document
- LinkML validation instance
- normalized SQL input with explicit PK/FK values

`format.ts` consequently acts as an implicit compiler. It derives interval
slugs, stamps paths, rewrites references, expands facets, and repairs authored
data. This is difficult to reason about and unsafe to extend.

Formatting and semantic compilation must separate.

## Direction

Use two LinkML schemas with a deterministic compiler between them:

```text
authored YAML
  → authoring LinkML validation
  → compile.ts
  → normalized catalog YAML
  → storage LinkML validation
  → SQL/database
```

### Authoring schema

Human-facing nested device description:

- no `node` values
- explicit identity axes
- facets inline on their interval
- structured references, never authored node paths
- useful validation errors at source locations

Example target shape:

```yaml
device_type: inverter
slug: foxess-h3-ps10sh
features:
  - type: ac-phase
    role: out
    parts: [a, b, c]
    intervals:
      - part: a
        quantity: voltage
        slug: range
        range: { min: 0, max: 250 }
        measurement: { resolution: 0.1 }
      - quantity: active-power
        slug: continuous
        range: { min: -11000, max: 10000 }
        specification:
          rating: continuous
          gated_by:
            feature: { type: environment, role: ambient }
            quantity: temperature
            interval: continuous
```

Do not infer interval slugs. Authors state every identity discriminator. The
compiler derives only redundant representations such as complete paths and
FKs.

### Storage schema

Machine-facing normalized rows:

- explicit node PKs and FKs
- one table-oriented class per stored row
- suitable for LinkML SQL generation
- generated device-model rows; never hand-authored

`Specification`, `Measurement`, and `ValuedRange` are width facets of
`Interval`. All use exactly the interval node. They add no identity segment.

## Identity

Canonical interval trail:

```text
node:<device-type>/<model>/<feature-type>/<feature-role>/<part|_>/<quantity-kind>/<interval-slug>
```

Example:

```text
node:inverter/foxess-h3-ps10sh/ac-phase/out/a/voltage/range
```

Ordered levels:

```text
device type → model → feature type → feature → part? → interval
                                                        ├─ specification facet
                                                        ├─ measurement facet
                                                        └─ valued range facet
```

One typed path constructor must own this grammar. No generic recursive
slug/role traversal. No string replacement as reference resolution.

## Compiler responsibilities

Only:

1. Build canonical coordinates and node paths.
2. Expand inline facets into normalized rows sharing the interval node.
3. Resolve structured references against compiled coordinates.
4. Reject duplicate coordinates and unresolved references.

It must not infer domain meaning from payload shape.

## Shared schema

Share only stable primitives between authoring and storage schemas:

- scalar types
- enums
- slug patterns
- units where genuinely identical

Do not inherit storage classes from authoring classes. Their shapes differ by
design.

Suggested layout:

```text
packages/schema/
  linkml/
    shared.yaml
    authoring.yaml
    storage.yaml
  data/
    device_model/
      foxess-h3-ps10sh.yaml
  gen/
    catalog.yaml
    nodeve.sql
  compile.ts
  format.ts
```

Names may change after auditing current generation commands. Preserve the
conceptual boundary.

## Migration scope

Start with `device_model/foxess-h3-ps10sh.yaml` only. Registry, quantity-kind,
feature-type, and device-type files are already table-like; do not force them
through the device authoring DSL without a demonstrated need.

Recommended sequence:

1. Freeze current normalized FoxESS output as a golden fixture.
2. Define minimal authoring LinkML classes needed by FoxESS.
3. Write explicit coordinate/path types and constructor.
4. Compile features, parts, intervals, and three interval facets.
5. Compile structured `gated_by`, register feature, part, and interval targets.
6. Validate generated rows with the storage schema.
7. Replace FoxESS source with node-free authored YAML.
8. Reduce `format.ts` to presentation-only formatting.
9. Remove obsolete stamping/desugaring only after parity tests pass.

Avoid a repository-wide migration until this example is clean.

## Acceptance

- Authored FoxESS contains no `node` keys.
- Every interval slug is explicit.
- Changing feature type changes generated descendant paths predictably.
- Every interval facet node equals its interval node.
- Dangling structured references fail compilation with source context.
- Duplicate coordinates fail before storage validation.
- Generated catalog passes storage LinkML validation.
- Generated database builds.
- Compiler output is deterministic and snapshot-tested.
- `format.ts` performs no identity or reference semantics.

## Current experiment

The worktree currently includes an experimental `stampModelNodes` pass in
`format.ts` plus rewritten FoxESS nodes and `levels.md` edits. Treat these as
evidence and possible fixture material, not architecture to preserve. Audit the
diff before deciding what to retain.
