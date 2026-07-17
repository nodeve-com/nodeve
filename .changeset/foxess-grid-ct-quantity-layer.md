---
'@nodeve/grimoire': minor
---

FoxESS H3 PS-10.0-SH: split the inverter's AC output (new `ac_phase_three_out`) from the grid CT / utility meter (`ac_phase_three_grid`), and decode every readable H3_SMART register (grid CT net power, directional feed-in/consumption energy, inverter total power + total_yield/input_energy, PV/load daily energy).

New `quantity` concept layer — a valued `qudt:Quantity` naming a specific measurand over a base `quantity_kind` (e.g. `feed_in_energy` → `active_energy`), so directional/windowed channels of one kind coexist as distinct sensors. New exports: `QUANTITY` vocab, `baseQuantityKind`, `enumeration/quantity`, `archetypes/quantity`; `ModbusRegister` gains an optional `quantity` field.

NOTE (breaking for catalog consumers, additive for the TS API): the ps10sh `ac_phase_three_grid` feature now models the grid CT, not the inverter output — sensor IDs derived from that entry change. Downstream consumers (familiar's farana-rs / ha-config / site) must retag to `ac_phase_three_out` and read the new `quantity` register field.
