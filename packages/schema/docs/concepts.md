# Concepts — self-describing, native-first

## Facet → field

- `title` / `description` = english `title` and `lede`. LinkML `description:` becomes `lede` in data
- `meaning` = semantic identity (one CURIE)
- `exact_/close_/broad_/narrow_/related_mappings` = external refs
- `annotations.i18n.value.<field>.<lang>` (field ∈ `{title,lede,body}`)
- `#` = inline comments **kept as terse as possible**

### Translations

**schema → data** Every translation lives on its schema element. Use `annotations.i18n.value.<field>.<lang>` (`{ i18n: { value: { title: { pt: … } } } }`). The Content model has three prose fields: `title` (label), `lede` (short prose), `body` (full markdown). Native `en` pair `title`/`description` projects to Content `title`/`lede`. English `body` and all translations ride `annotations.i18n.value.body.<lang>`.

## Enums stay native

Closed vocabulary → LinkML **enum**, a slot's `range` points at it: native closed-set validation + drift protection, no projected `any_of`, no FK gate. Each permissible value carries the full facet set — **never promote an enum to data rows** for refs or translations. **Table only** when members carry a real column beyond the facet set: `quantity_kind` (`si_unit`, `accumulation`, `broader` hierarchy) qualifies; plain grammar (flow direction, severity, rating, zone, register type…) stays enum.

## Migration fixes

Undo the working tree's wrong turn (enum→data promotion, mappings-as-schema-mandate, pt sidecar).

**Keep:** `slug_qualified`→`permalink` (`core.yaml`, `normalize/catalog.ts`); `title:` on slots/enums/classes.

**Revert:**

- Delete `data/domain/` + `data/domain_member/`.
- `values.yaml`: drop `Domain` class + `domain` slot; `DomainMember` → `{node, slug, ordinal, contents}`.
- `core.yaml`: drop `domains` + `domain_members` from `Catalog`.
- Restore enums in `shared.yaml` (`FlowDirection`, `Period`, `Zone`, `Severity`, `Rating`, `InterfaceType`, `ServiceProtocol`, `PhysicalLayer`) + `accumulation` in `taxonomy.yaml`; repoint each slot `range` off `DomainMember` (`flow_direction`, `period`, `severity`, `zone`, `rating`, `interface_type`, `service_protocol`, `physical_layer`, `accumulation`).
- `data/quantity_kind/*.yaml`: `accumulation-instantaneous`→`instantaneous`, `accumulation-cumulative-monotonic`→`cumulative_monotonic`.
- `check-meta.ts` → [The check](#the-check).

**Redo native:** per restored enum, transcribe each member's facet set from `packages/grimoire/concepts/enumeration/<name>/*.yaml` — `refs:` `registry_id:term` → `*_mappings` (`match`→strength), `title.pt` + pt body → `annotations.i18n.value.pt`; CURIE prefixes in `nodeve.yaml`. Same for admin-facing slots; plumbing slots get neither.

## Verify

`pnpm generate`/`build`/`typecheck` green (ignore pre-existing `ac_ports/dc_ports/environments` SAWarning). pt in the source enum (`Content` projection separate). Completeness: no grimoire `refs`/`pt` left behind.
