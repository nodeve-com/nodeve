---
name: schema-translations-in-schema
description: '@nodeve/schema translations live ON the schema element (annotations.i18n), projected schema→data to Content rows — never authored in data/'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5b802928-91c1-4a8b-b6b7-83e00664c434
  modified: 2026-07-22T22:33:29.837Z
---

In `packages/schema` (LinkML), author translations **on the schema element** — the slot or the permissible value — as `annotations.i18n.value.<field>.<lang>` (field ∈ `{title,lede,body}`), beside the native en pair (`title`/`description`). Example: `{ i18n: { value: { title: { pt: Contínuo } } } }`.

**Direction is schema → data, never data → schema.** `Content(language)` rows are a _projection_ of these annotations, not an authoring surface. Never write a translation into `data/`.

**`description` IS `lede`.** Content prose fields are `{title, lede, body}`; a LinkML slot gets exactly two — `title` + `description`. Bound intentionally: LinkML `description` == Content `lede` (short admin prose), named `description` only because LinkML fixes that slot name. So native `title`/`description` → Content `title`/`lede`; `body` has no native slot and rides `annotations.i18n.value.body.<lang>` (en included). Never invent a `lede:` slot key — LinkML drops it. `description:` is always admin-facing prose; **developer-only prose is a `#` comment, kept as terse as possible — never a `description:`**. Plumbing-slot `description:` explaining mechanics to a dev belongs in a `#` comment — move it and trim.

**Why:** the working tree split two ways — enums (`linkml/enums.yaml`) already do it right (schema-side `value.title.pt`), but slot translations sat in `data/property/*.yaml` (`{content:{pt:{title:…}}}`), and `catalog.ts` even asserted "LinkML has no i18n." Wrong turn: LinkML lacks _native_ i18n, so annotations carry it — that's still schema-side. See [[schema-urgency]], [[bulk-load-vocabularies]].

**How to apply:** new/moved translation → onto the slot or permissible value in `linkml/`, not `data/`. Docs: `docs/concepts.md#translations` is canonical; `mapping.md` + `levels.md` reconciled. Remaining migration (code, follow-on): move `data/property/*.yaml` translations onto their slots and rewrite `normalize/catalog.ts` to read `annotations.i18n` instead of `data/property` + drop the "no i18n" comment.
