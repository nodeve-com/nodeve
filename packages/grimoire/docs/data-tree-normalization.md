# Data-tree normalization

**Scope:** `generate.ts` data emit, `kit/compile.ts` comments, readers, tests

## Rule

`generated/<layer>/<slug>.json` is a **clean, slim JSON of the YAML** — one file per concept, same shape as the source, sugar resolved, nested concepts kept as references. NOT a fully-resolved tree. It's the "clean version" outside projects read instead of the sugared YAML; keep it close to the YAML so it stays cheap to change as the concept model evolves.

Materializing the full joined tree (every nested concept spliced in) is a read-time job, not a build artifact.

## Orientation (relational) — do not delete

property = **column** · feature = **table** (flat `prop:` map) · archetype = **view** (names its feature-tables as `<featureSlug>.<propSlug>`, does NOT merge them into one flat sheet) · catalog entry = **row**. An archetype naming a table is a reference, not a copy — inlining the table into the view at build time is the de-normalization this doc stops.

## State — the bug

`archetypes/inverter.json` is 6.3 MB from a 4 KB source. Two build-time inlines cause it:

1. **Strip drops the refs.** `compile.ts:127` tags each nested feature/archetype slot with `$concept` (a compile-internal breadcrumb). The `.schema.json` honors it — `$ref`/`$defs`, shape defined once (`project.ts:47-49`). But the DATA emit calls `stripConceptTags` (`generate.ts:230-235,284`), erasing the tags so every nested concept serializes inline.
2. **Spec wrap clones per column.** `is_specification` replaces each `quantity_kind` column with the whole `specification` archetype cloned in (`shape-finish.ts:64`); the strip then inlines it once per column — the bulk of the 6 MB.

Files are untracked — the fix lands before they enter git history.

> `$concept` is internal-only today (never written to a file). If the data emit starts carrying references, whatever marks one becomes a committed contract — so it must be self-evident and grounded in the YAML (a concept's own slug/identity), not a synthetic tag a reader has to learn. Prefer json-schema's own `$ref`/`$id`/`$defs` vocabulary where it fits; json-schema can't hold i18n, so the data JSON stays a separate artifact from the schema.

## Poison — the FLATTEN language

Agents inline because the def-language is described as **flattening**. Reword so the view/table model is the only story:

| Where | Fix |
| --- | --- |
| `concepts/README.md:27,34,38,62` | "compose … FLATTEN the props in" → "compose … reuse a sibling table's columns" |
| `kit/compile.ts:36,99-106,161-179` | comments describe compose as column reuse, not flattening |
| `concepts/features/concept_settings.yaml:2` | same |

`compose` the mechanism STAYS unchanged — merging is fine as it stands. A referential form is added only if/when a need shows up, not now. This pass only fixes the wording.

## Transforms — keep vs reference

| Transform | Where | Action |
| --- | --- | --- |
| Overlay merge (`applyOverride`) | overrides.ts | Keep (form/ui/validation patch) |
| Enum expansion (`enums:` → `enum:`) | compile.ts | Keep (already in the schema too) |
| `default` → `part`/`instances`, drop `default` | repeated-emit.ts | Keep — the one thing that MUST resolve out (default applies to parts/instances, never carries to JSON) |
| Register→spec backfill | repeated-emit.ts | Keep |
| `combined`/`part`/`instances` (named instances) | shape-finish.ts | Keep |
| `compose` merge | compile.ts:171-179 | Unchanged; referential form added if/when needed |
| Nested feature/archetype inline | compile.ts:259-274, generate.ts:284 | **Reference** — the fix |
| `specification` cloned per column | shape-finish.ts:64 | **Reference** — the fix |

## Do

1. **Stop inlining.** Drop `stripConceptTags` (generate.ts:230-235,284) so the data emit keeps references instead of splicing nested concepts in. Resolve one level only — a concept's own fields plus references to nested concepts, the same equality test `project.ts` runs for `$ref` hoisting.
2. **Migrate readers.** Audit which readers (`loadDevice`/`loadDeviceAs`/`modbusMediumOf`, site-view, measurand-tree) actually read INTO nested-concept depth vs only top-level. Those that go deep resolve the reference on read; the rest are untouched. Keep it minimal — no new loader framework.
3. **Reference validation.** A build-time pass asserting every reference resolves — the guarantee inlining implicitly gave. Lean on the existing `guard-refs` / reference-model.md primitive; don't invent a parallel one.
4. **Size guardrail.** A generated-output size budget in the check suite (none exists). Post-fix `inverter.json` is single-digit KB; the budget catches re-inlining regressions.
5. **Reword the FLATTEN language** (Poison table).

## Done when

- `inverter.json` single-digit KB; data emit referential, matching the schema.
- Readers still return correct values (resolving on read where needed).
- Reference validation + size checks in the suite; `tests/generate.test.ts` asserts the slim output.
- FLATTEN language reworded.
- `generated/` safe to commit, then a full version bump across affected packages.
