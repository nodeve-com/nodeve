# grimoire feature model — flat features, parts XOR instances

A catalog entry's top-level keys (besides `product` and `connectivity`) are **features**: one level deep, no nested sub-features. Each feature is its own `features/<feature>.ts` atom composed into a named slot (the [every-feature-is-an-atom rule](../concepts/README.md#conventions)). Archetypes only compose + name slots; they declare no field shapes of their own. (Reserve sub-features for a catalog entry that spans more than one archetype.)

The model is flat, not a recursive feature tree — that earlier tree, and the rejected "feature menu / AttributeSpec" projection layer that briefly replaced it, are both gone. Archetypes compose feature atoms DIRECTLY in TypeBox: the schema IS the source. The prototype is [`catalog/foxess/h3/ps-10.0-sh.yaml`](../catalog/foxess/h3/ps-10.0-sh.yaml) — read it for the concrete shape.

## Single vs repeated — parts XOR instances

A feature is **single**, **parted**, or **counted** — the last two are the repeated forms, and a feature uses **parts or instances, never both**:

- **single (`house_load`, `enclosure`)** — an _inherently-singular whole / meta value_. No instances exist to count (one enclosure, one whole-house total, a dehumidifier's own temp/RH). Its body is a spec-map directly — that body IS the combined value. Composed as the atom directly.
- **parted (`ac_phase_three_*`): `{ combined?, default?, part? }`** — a FIXED named instance set. The set lives once in `concepts/parts/<slug>.yaml` (kind → names, e.g. `ac_phase: [a,b,c]` + `ac_line: [ab,bc,ca]`); the feature def references it via `part:`. No `count` (the parts map fixes the set), no `instances`. Authored `default` is KIND-keyed (`default.ac_phase.…`); authored `part` is NAME-keyed sparse overrides (`part.c.…`).
- **counted (`pv_tracker`): `{ count, combined?, default?, instances? }`** — discrete, countable instances (`repeated: true` on the feature def). `instances?` are sparse `{ordinal}`-tagged (1-based) overrides of `default`.

In both repeated forms `combined?` is the non-derivable whole-feature total, and `default` is **authoring-only**: the generated catalog never exports it. The emit resolves each part/instance to its filled node. `part.<name>` = its kind's default ⊕ the authored part override, with all kinds' parts merged into the one `part` map; `instances[n]` = one row per `count`, `default` ⊕ its ordinal's override. The overlay is a deep-merge with ROW-level `intervals` semantics: an override row replaces the default row sharing its band key (`interval_kind`+`rating`+`zone`+`flow_direction`+`period`). Unstated rows stay inherited; unmatched rows append; an authored empty array is an explicit clear. Other arrays replace wholesale.

**`count: 1` ≠ count-less.** `count: 1` is _one discrete instance_ (a Shelly relay box with a single power+relay circuit — same _kind_ of thing as `count: 2`, just one of it). Count-less is _the single whole_ (no instance to count). Rule: never write `count: 1` for a whole; never omit `count` for something you could ever see two of.

## feature_spec direction — hoist the spec body onto the feature def

**Landed (the compiler reads the `feature_spec` slot; the emit is `feature_spec`-wrapped).** A feature is a [`thing`](../concepts/archetypes/thing.yaml) (title / description / `identity` — a unique slug) that also carries two def-language slots ([`archetypes/feature.yaml`](../concepts/archetypes/feature.yaml)): `concept_settings` (the grammar, incl. `count` + `is_specification`) and **`feature_spec`** (the spec body `{combined, default, part, instances}` — [`features/feature_spec.yaml`](../concepts/features/feature_spec.yaml)).

Every catalog instance authors its spec body under `feature_spec` (`ac_phase_three_point: {feature_spec: {combined, default}}`). A feature is `feature_spec`-wrapped when it CARRIES A SPECIFICATION — marked `is_specification`, parted/counted, or composing a spec feature. The remaining data step is authoring the agnostic default bands on the **feature definition** too, gated by `concept_settings.is_specification`, so an instance states only deltas. The cascade already folds them. Field roles:

- **`combined`** — the feature's OWN whole spec. A **partless** spec feature (`electrical_quantity`, `ac_phase`, `enclosure`) authors its columns HERE.
- **`default`** — the per-part/per-instance template (parted/counted only), AUTHORING-ONLY (resolved away in the emit). Cascade: `part.<name>` ⊕ parent `default.<kind>` ⊕ `<kind-feature>.feature_spec.combined` — a parent overrides deltas off the kind feature's own def rather than restating per-phase bands.
- **`part`** / **`instances`** — sparse per-name / per-ordinal overrides. A register link addresses one via `part_id` (parted) OR `ordinal` (counted), never both: `part_id` **wins over `ordinal`** when a link carries both (`kit/sensor-id.ts` `partId ?? ordinal`; the id/topic segment is the part name, not the number).

### How the compiler wires it

1. **`kit/shape-finish.ts`** — `finishShape` wraps a spec feature's body under `feature_spec` (partless → `combined`; parted → `combined`/`default`/`part`; counted → `combined`/`default`/`instances` + `count` under `concept_settings`). `specColumns` unwraps a composed/parted kind feature's `combined` columns so they re-home under the composer's own `feature_spec` (used by `kit/compile.ts`'s `compose` too).
2. **`kit/repeated-emit.ts`** — `resolveRepeatedFeatures` / `backfillRegisterSpecNodes` read + write through `feature_spec` (`count` from `concept_settings`), folding each part-kind's def `combined` under `default.<kind>` before overlay.
3. **`kit/measurand-tree.ts`** — a measurand feature is one carrying a `feature_spec`; `measurandCells` descends it.
4. **`scripts/generate-site.ts` + `kit/site-view.ts`** — the sensor-id patch nests under a `.feature_spec` segment, merged + re-read through the same hop.
5. **Emit is `feature_spec`-wrapped** — a breaking contract change (version bump). The consuming gateway is NOT affected — it reads only the flat `modbus`/`modbus_registers` block, never the spec body.
6. **Remaining (optional data step):** hoist agnostic defaults onto `ac_phase.yaml` / `electrical_quantity.yaml` / the `ac_phase_three_*` defs and shed the now-inherited bands from `dtsu666`/`ps10sh` `default.<kind>`.

## A feature body

A feature body is a spec-map of its quantities (each an `intervals` list — see below), plus categorical vocab-code fields where needed (e.g. `compressor.refrigerant` → an `enumeration/refrigerant/` code, sitting beside its quantities in the same atom, NOT a sibling atom).

### interval (item of `intervals`)

A rated/characterised region named on orthogonal, co-occurrable band axes:

- **`interval_kind?`** — the closed TOP classifier (`enumeration/interval_kind`). Three kinds, all STATELESS (`f(reading) → in-band?`) by default: `measurable` (instrument-readable span), `rating` (a rated capability tier), `zone` (a named operating region → a boolean "in this region" sensor). Any interval carrying `trigger_on` becomes STATEFUL (`f(reading, prior_state) → on/off`) — a hysteretic trigger — but that is an axis orthogonal to interval_kind (most often on a zone, whose name handles the sensor; a startup/shutdown rating takes it too), not a fourth kind. **Always authorable explicitly**; omit it and it's DERIVED from the base axes — `rating` from a rating tier, `zone` from a zone name. `measurable` isn't derivable from bounds, so a bare span must author it.
- **`rating?`** — the tier of a `rating` band (`enumeration/rating`): `continuous` / `intermittent` / `short_term` / `startup` / `shutdown` / `survival` / `protection_required`. The capability ENVELOPE — how far / how long it's rated to be pushed. A bounds-free bare `value` (a nameplate, grade it `severity: nominal`) also derives `rating`.
- **`zone?`** — a named operating REGION (`enumeration/zone`): an electrical operating point/window (`mppt`, `mpp`, `open_circuit`) or a lifecycle status band (`off`, `idle`, `running`). Where it ACTUALLY sits, not what it's rated for. Which enum a value lives in (rating vs zone) IS its classification; reclassifying a blurry value (`startup`, `mpp`) is a one-file move. A narrower sub-range grades via `severity` (a tight full-power window is `severity: best`).
- **`min?`/`max?` + `trigger_on?`** — the STATEFUL trigger fields ([`trigger_on` on an interval](threshold.md), folding in the former standalone `threshold` feature and its dropped `interval_kind`). `min`/`max` are the two hysteresis edges (the deadband/hold zone — the same `min`/`max` a stateless band uses); `trigger_on` (`above`/`below`) picks which side is ON, the region OUTSIDE the deadband — the one irreducible bit `min`/`max` can't encode, and its presence is what makes the row stateful (an axis orthogonal to interval_kind — most often on a zone, whose name handles the sensor). A PV inverter's startup is `{ zone: running, trigger_on: above, min: 90, max: 140 }` — trips ON above 140 V, releases (dropout) below 90 V; a heat-mode thermostat is `{ zone: heating, trigger_on: below, min: 20, max: 21 }`. `value?` may ride along as an optional nominal setpoint (`severity: nominal`), display context only. The `zone` name (or `identity.slug`) handles the boolean sensor.
- **`flow_direction?`** — an IDENTITY axis (`enumeration/flow_direction`): `in` / `out` / `net`. Two intervals differing here are SEPARATE channels (distinct registers + sensor ids), not bands of one series.
- **`period?`** / **`severity?`** — the accumulation window, and an optional health grade (desirable → `nominal` centre → undesirable, crosswalking RFC 5424 / ISA-18.2; absent = not graded).

plus `value?` (the one role-neutral point — a zone operating value like Vmp/Voc, a stateful zone's trip, or a rated centre graded `severity: nominal`), one-sided `min?`/`max?`, band-around-value (absolute `tolerance?`/`tolerance_lower?`/`tolerance_upper?`, relative `margin?`/`margin_lower?`/`margin_upper?`, or the `fraction_lower?`/`fraction_upper?` multiplier sugar), `unit?`, `conditions?`.

A **measuring range IS an interval** — `interval_kind: measurable` (VIM 4.7 / ssn `MeasurementRange`). The dissolved `measurement` feature folded in here: the ONE `intervals` list holds both a thing's own behaviour bands and a sensor's readable span, told apart by `interval_kind`. Instrument-only fields (`resolution`, `max_permissible_error`, `channel`) are optional interval props, authored ONLY on a `measurable` band.

**Interval identity.** Every emitted interval carries an `identity.slug` — its addressable handle (a `condition.interval_item` names `{feature, property, interval}` by it). Unslugged rows DE-SUGAR from their identity axes (rating tier / zone name + `flow_direction`/`period` + condition tokens) at generate (`kit/interval-slugs.ts` `desugarIntervalSlugs`, after part/instance resolution), so two bare rows sharing every axis collide; slugs must be unique per `intervals` list or the bake fails — author distinct slugs (e.g. the gating `grid_region` member) on condition-split bands. A row with no addressable axis (the one undirected measurable channel) stays unslugged.

**zone vs condition.** A `zone` is intrinsic to the quantity — a named region of ITS own axis. An EXTERNAL driver that merely gates WHEN a band is valid (the unit's run mode making a compressor's draw apply) is NOT a zone — it's a categorical `condition`.

### condition (gate, EXTERNAL to the band's own quantity)

A gate holding NO bounds of its own (`concepts/features/condition.yaml`), in one of three forms, told apart by which slot carries a value. Conditions on one band AND together; model an OR as separate bands. Pointers are gate-checked per entry at generate (`kit/validate-conditions.ts`, after the slug de-sugar): an `interval_item` must resolve to an existing feature → property → interval slug on the same entry; a `setting` must be a `settings_schema` key and its `equals` a member of that key's `enum`.

- **`interval_item`** = `{ feature, property, interval }` — a POINTER at one identified band of another reading; the named band carries the region (holds below an enclosure's `below_derate` temp band).
- **`setting` + `equals`** — a COMMISSIONING gate: holds while a `settings_schema` key equals a value (`grid_region == eu_230v_50hz`, an `enumeration/grid_region` member — one knob fixes nominal voltage AND frequency). External config the site fixes once.
- **`test_condition`** — a STANDARDISED MEASUREMENT REFERENCE (`enumeration/test_condition`: `stc` / `bnpi` / `bsi` …) that rates the band. The named member fixes the reference environment (irradiance, spectrum, cell temp); the measured value stays IN the band. Omit for the implicit reference — a PV panel's bare bands are STC; spell it out only on a non-STC band (a bifacial module's rear-gain Isc/Pmax at BNPI/BSI).

## Cross-field constraints — raw draft-07 in the `schema:` slot

grimoire IS a JSON-Schema authoring layer, so cross-field rules — required-if, mutually-exclusive, `if/then/else`, `oneOf`, `dependentRequired` — are authored as **raw draft-07 keywords in the existing `schema:` slot** on the feature (or archetype). `kit/project.ts` merges an object node's `schema:` block into its emitted object schema; `schema` is a projection key in `kit/compile.ts` `instructionKeys(def)`, so the feature-doc validator permits it at the grouping level.

Example — `endpoint` requires reconnect fields when transport is tcp:

```yaml
schema:
  allOf:
    - if: { required: [transport_protocol], properties: { transport_protocol: { const: tcp } } }
      then: { required: [connect_timeout_ms, reconnect_period_ms] }
```

Guard each `if` with `required:` on the trigger field so the rule stays vacuous where the field is absent (bare instances, `parts:`-keyed maps) — no blast radius. Reach for raw JSON Schema FIRST; only weigh a new `concept_settings` key when JSON Schema genuinely can't express the rule. A coined DSL that re-describes JSON Schema violates "borrow the standard, no local dialects."

## Keep features whole — the single-prop smell

A feature carrying a lone prop/enum (a `transport_protocol`-only feature) is a smell: the field belongs one level UP, inside the feature whose tuple it completes. A socket address IS `(host, port, transport_protocol)` at L4 — splitting transport out fragments one concept and then forces a second "reach" feature to redescribe it. Fold the field home, then express any variant behaviour with a raw `schema:` on the composing feature (above), not a per-variant feature. Worked example: `inet_socket` deleted, `endpoint` absorbed both layers — a `message_protocol` scheme (L7, TCP-family) pins the composed `transport_protocol` to tcp; schemeless = raw tcp/udp; one `required:`-guarded `allOf` does L7-implies-tcp + tcp-needs-dial-policy.

## Note

All slugs are snake_case — the repo `Slug` primitive forbids hyphens. This extends to source filenames: a concept's `name` is its filename verbatim (`pv_module` → `pv_module.ts` → `pv_module.schema.json`). `kit/` helper modules (`json-schema.ts`, `project-telemetry.ts`) are plain code, not concept identifiers, and stay kebab.
