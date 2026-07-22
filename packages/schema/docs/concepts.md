# Concepts — self-describing, native-first

## Facet → field

`title` / `description` = en label / prose, admin-facing app content (**the en pair**) · `meaning` = semantic identity (one CURIE) · `exact_/close_/broad_/narrow_/related_mappings` = external refs (>1, any element incl. permissible values) · `annotations.i18n.vale.title|description.<lang>` · `#` = dev aside.

## Translations

The en pair is one string each — the sole facet needing a convention. Nest `annotations.i18n.value.<lang>`, mirroring `Content` (`{title,lede,body}`) 1:1 so extraction is a loop. **Not `structured_aliases`**: one `literal_form`, can't pair a title with its description.

## Enums stay native

Closed vocabulary → LinkML **enum**, a slot's `range` points at it: native closed-set validation + drift protection, no projected `any_of`, no FK gate. Each permissible value carries the full facet set — **never promote an enum to data rows** for refs or translations. **Table only** when members carry a real column beyond the facet set: `quantity_kind` (`si_unit`, `accumulation`, `broader` hierarchy) qualifies; plain grammar (flow direction, severity, rating, zone, register type…) stays enum.

## Projection

`annotations.i18n.value.<lang>` → `Content(language)`, en `Content` from the pair. `meaning`/`*_mappings` → `Ref` rows only once a consumer stores them.

## The check

Replaces `check-meta.ts`'s wrong mappings-on-every-slot rule. Same source, flags migration drops: a grimoire concept that carried `refs`/`pt` must keep the same `*_mappings` + `annotations.i18n`. Structural plumbing (`node`, `permalink`, FKs) is exempt.

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
