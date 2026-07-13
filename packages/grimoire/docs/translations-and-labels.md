# Translations & labels

Labels, hints, and presentation hints live **inline in the concept YAML**, per locale, and baked into the one generated file per archetype — not carried in separate `lang.json` / `ui.json` sidecars. `LocaleCode` is the one locale list — today `'en' | 'pt'`; add a locale there and every inline label must fill it (a bake totality check, not a `satisfies` trick).

Two distinct things get localized:

- **Field _labels_ — the schema's presentation.** A vocab prop owns its `label` + `hint` per locale, authored beside its definition. Because exactly one vocab prop owns a field name, its label resolves by name everywhere the prop appears — features and archetypes cite the code and never restate the text. Labels are total: bake fails on any missing field/locale.
- **Field _values_ — instance data.** `I18nText` (`features/i18n_text.yaml`): a `{ en, pt }` record used as a field's _type_ wherever a stored string is user-facing (a registry `name`, a `description`). The value itself carries the translation, not the label.

Non-derivable presentation hints (`mono` — render this string monospace) live inline on the prop too, partial — only the fields that need one.

## How they reach the generated file

`schema.json` is not a separate language-free artifact — bake emits **one file per archetype** carrying the sealed value contract together with the labels/hints/ui resolved from vocab. A downstream consumer (a form renderer, a doc generator) reads that one file. Because labels resolve **from vocab by field name**, an archetype defines no text of its own — it inherits every composed prop's label wherever the prop appears, including nested slots (a device carries the modbus register-decode labels through its `connectivity` block).

The pre-commit hook regenerates + re-stages the artifacts; `tests/generate.test.ts` asserts the committed mirrors match, so **never hand-edit the generated file**.

## Rationale record (was `field.ts`, then `concepts/features/field.yaml`)

How an atom carries presentation + i18n WITHOUT polluting the value contract: i18n never goes into JSON-Schema title/description as records (breaks standard tools); text + presentation live in SIDE dictionaries keyed by field id (gettext / i18next / JSON-Forms convention). Three independent emits, merged by consuming tooling: `schema.json` the clean value contract, `lang.json` per-locale label+hint per field (TOTAL: a gap fails check), `ui.json` non-derivable presentation hints (PARTIAL; e.g. `mono`: code-like content). Plus the crosswalk sidecar (`refs`): registry + term + SKOS match per field, with a `self` slot for the atom as a whole — resolves to full IRIs via the registry's `iri_template`. In the YAML layer this is superseded by inline title/description/refs on property files and per-feature `prop.<name>.*` overrides.
