Continue the FoxESS pdu-catalog reshape in packages/schema. Pre-1.0: break freely, reshape rather than patch. Nothing is wired — the normalizer does not yet understand this shape, so `pnpm check` will reject it. That is expected.

## Shape that landed

A pdu is authored once in data/pdu_catalog/foxess/ and carries the field sequence. Where the same measurands sit at more than one coordinate, that is ONE pdu with a `placement:` list, never two blocks (packages/schema/CLAUDE.md).

- the pdu holds what does not vary (datatype, unit, the field sequence)
- a `placement:` entry holds start plus whatever co-varies with it — `width`, `transform`, or a target coordinate like `part`
- a family in data/subject_node/inverter/ names the pdus it INCLUDES; a bare key means "include, no departure", a value states the departure
- anything absent from a family's include list is never queried

Reformed already: identity.yaml, energy.yaml (16 accumulators, 3 placements), battery.yaml (battery-soh 2, battery-string 2 carrying `part`), settings.yaml (work-mode 2, charge-period 2, charge-limit 2), pv.yaml (pv-tracker 4, pv-tracker-vi 6, pv-tracker-power 6), state.yaml (run-state 2, state-flags, state-code), fault.yaml (fault-code 3, fault-code-3word), sensors.yaml (sensors-ac-eps), battery.yaml (battery-detail). No address-shaped slug is left. foxess-inverter carries the base include list; foxess-h3-smart carries a full one.

Conditional overrides reuse the rule grammar from data/variable/ verbatim: `[ { when: [ { variable: firmware-legacy, is: true } ], value: … } ]`.

Removed and not coming back: `end` (derivable from the field extent), pdu_variant (slot, data, and normalizer plumbing), condition-keyed transform maps, and every address-shaped slug that a placement can move.

## Open work

1. Rename the three placeholder slugs — `fault-code-3word`, `sensors-ac-eps`, `battery-detail`. The two fault vocabularies are DISJOINT rather than one a subset, so no content word separates them and width is a stand-in; foxess_modbus calls them STANDARD_FAULTS and H3_PRO_KH_133_FAULTS, both reader names. Its comment claims the seven-word set is wrong for the KH. sensors-ac-eps has the same problem against sensors-single-phase, whose measurands it overlaps at a different layout.
2. Convert the remaining eleven families to include lists, and delete the `condition:` lists still in sensors.yaml, battery.yaml, three-phase.yaml, single-phase.yaml — the catalog should not name who reads it. Derive the lists from entity_descriptions.py's `models=Inv.…` flags, mechanically, not by guessing. NOTE: include-list semantics and the lists must land together, or every unconverted family silently loses every pdu it does not restate.

## Facts established, do not re-derive

- There is NO single "map group". Two partitions run through the catalog: firmware(36001) and pv(39070) are read by H1-G2, KH>=1.33, H3-Pro, H3-Smart, EVO; energy(39601) and settings(46607) by H3-Pro, H3-Smart, EVO only. So a catalog-side group slug cannot work — inclusion is per family, per pdu.
- FoxESS firmware registers are packed BCD (each nibble one decimal digit; 0x0120 reads 120, not 288). This is a transform STEP, not a type: `bcd` is a boolean slot on Transform in linkml/decode.yaml, running before the arithmetic in a fixed order. foxess_modbus's `is_hex` names its own trick (printing a byte as hex digits decodes BCD when every nibble is 0-9).
- Probed a live H3 Smart (model string P3-10.0-SH) over modbus-tcp, function 03 only. Answered: 37609, 38307, 38814, 38914, 39063, 39123, 39601, 46501, 46607, 49203. Silent: 31000, 31006, 31090, 32000, 39423, and everything 39999-45000 including the whole 41xxx block. An unimplemented range does NOT return exception 02 on this device — it times out. mbpoll needs `-0 -o 5`.
- Addresses OVERLAP between layouts with different meanings. 31031-31038 is the fault run in single-phase and Grid CT / Load Power in three-phase; 31044-31051 is the reverse. Never cut or merge these files by address range — match on content. A range-based edit deletes real measurands silently.
- battery-string's holes (37613-37616, 37621-37623, 37625-37631) are IMPLEMENTED — the full 24-register span reads clean. They are undecoded words, not a pdu boundary. No `invalid` range construct is needed: a family's include list is the positive statement, and nothing bridges gaps.

## How to work

- foxess_modbus (~/dev/foxess/) is the ONLY source for this catalog and it is reverse-engineered from GitHub discussion threads. Cite it as that lib's claim, never as a fact about the device. Its comments are not evidence.
- No invented keys. If a fact has no slot, say the slot is missing — do not mint a key, slug, or enum member. Check data/variable/ and the LinkML enums first; Period (daily/monthly/yearly/lifetime) and flow_direction already exist.
- A name earns its place only when something branches on it. A key that restates its own value, or means "not the other one", is slop.
- No install, no owner, no "we poll". The repo describes device models.
- Verify with `node bin/format.ts --check` and `pnpm typecheck`. The formatter routes linkml/_.yaml through formatSchema and data/\**/_.yaml through formatData — do not run the data pass over a schema file.
- See MEMORY/no-invented-keys.md and MEMORY/no-invented-context.md.
