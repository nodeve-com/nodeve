# grimoire → LinkML

How each grimoire construct lands in the relational LinkML model. Reusable tables that device types assemble — not wide tables repeating column names.

| grimoire | LinkML | note |
| --- | --- | --- |
| property | slot | global-by-default — grimoire hand-enforces this; LinkML gives it natively |
| prop overlay | `slot_usage` | per-class refinement, no fork |
| (anti-slop rule) | zero domain `attributes:` | attributes = anonymous class-local slots; every domain field is a global slot, one generic name (`range_kind`, not `kind`) |
| feature | class → table | `AcPort` is ONE table; out/grid/eps/load are four FKs to it |
| quantity_kind enum | `QuantityKind` table + `Ref` rows | `is_a` on an enum neither constrains nor inherits, so a typo'd projected value silently mints a new permissible value. Master list is rows; every citation an FK |
| `refs:` block | `Ref` → `Registry` tables | the ONE outward link. LinkML's `exact_mappings:` annotates SCHEMA elements; these are DATA, so mappings are data. `match` stays an enum — closed SKOS grammar |
| socket contract | `SocketBinding` rows | role vocabularies + required-ness project from these, not hand-written |
| archetype | `DeviceType` + binding rows | projects to a validation class, never a type-specific table |
| `product:` + mfr cascade | `Product` → `Manufacturer` tables | cascade = shared FK row |
| `compose` | `is_a` / `mixins` | single inheritance + mixins cover current uses |
| part (l1/l2/l3) | `Part` row | new part kind = new ROW, never a column. Schema enums stay only for closed grammar (rating, severity) |
| i18n keys (en/pt) | schema `annotations.i18n` → projected `Content(language)` rows | translations authored on the slot/permissible value, never in `data/`; rows are the projection. See [concepts.md](concepts.md#translations) |
| repeated + instances | `Part` rows + `ordinal` | one row per instance; `ordinal` sorts, drawn from authored position, never hand-typed |
| energy channels | `flow_direction` + `period` columns | four rows on one kind |
| combined vs per-leg | `part` column, non-null | member slug, `_` = the whole, `*` = the per-part default; the slug pattern produces neither marker |
| modbus block | `RegisterMap`, own table | many products FK one family map — comms out of the device |
| settings_schema | `Setting` + `DomainMember` rows | commissioning knob; a gate FKs the setting AND the member, so a typo'd value dies at the DB FK gate |
| modbus decode | `Channel` + `RegisterFlag` rows | categorical sibling of `Interval` — enum-valued, no quantity_kind. Flag words are registers in the ONE map (`flag:` list, index = bit, null = unidentified); channel members mint from the labels + `empty`. Semantics on the model, wire mapping on the map |

## Identity

Addressable identity, facets, node paths: [levels.md](levels.md#node--addressable-identity). Validation ownership: [levels.md](levels.md#validation-across-levels).

## PK/FK

- single-valued object slot → FK column on the parent (`inverter.ac_out_node`)
- multivalued inlined slot → backref FK on the child (`interval.ac_port_node`)
