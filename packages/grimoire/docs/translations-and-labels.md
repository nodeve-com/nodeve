# Translations & labels

Labels, hints, and presentation hints live **inline in the concept YAML**, per locale, and baked into the one generated file per archetype — not carried in separate `lang.json` / `ui.json` sidecars. `LocaleCode` (`concepts/features/field.yaml`) is the one locale list — today `'en' | 'pt'`; add a locale there and every inline label must fill it (a bake totality check, not a `satisfies` trick).

Two distinct things get localized:

- **Field _labels_ — the schema's presentation.** A vocab prop owns its `label` + `hint` per locale, authored beside its definition. Because exactly one vocab prop owns a field name, its label resolves by name everywhere the prop appears — features and archetypes cite the code and never restate the text. Labels are total: bake fails on any missing field/locale.
- **Field _values_ — instance data.** `I18nText` (`features/i18n_text.yaml`): a `{ en, pt }` record used as a field's _type_ wherever a stored string is user-facing (a registry `name`, a `description`). The value itself carries the translation, not the label.

Non-derivable presentation hints (`mono` — render this string monospace) live inline on the prop too, partial — only the fields that need one.

## How they reach the generated file

`schema.json` is not a separate language-free artifact — bake emits **one file per archetype** carrying the sealed value contract together with the labels/hints/ui resolved from vocab. A downstream consumer (a form renderer, a doc generator) reads that one file. Because labels resolve **from vocab by field name**, an archetype defines no text of its own — it inherits every composed prop's label wherever the prop appears, including nested slots (a device carries the modbus register-decode labels through its `connectivity` block).

The pre-commit hook regenerates + re-stages the artifacts; `tests/generate.test.ts` asserts the committed mirrors match, so **never hand-edit the generated file**.
