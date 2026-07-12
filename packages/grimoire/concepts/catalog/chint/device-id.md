# DTSU666 — is there a device ID? (open investigation)

**Status: unconfirmed.** The published DTSU666 register map has **no documented unique hardware/serial-number register.** `dtsu666.yaml` maps only the measurement banks (bank A `0x2000`, bank B `0x1510`/`0x1000`); it deliberately maps no config/identity block. This note records where an identifier _could_ live so a future probe doesn't start from scratch — none of these is confirmed readable on our unit's firmware.

## Why this is hard

- This firmware already returns **"Illegal data address"** on the `0x4000` energy block (see the "Deliberately NOT polled" note in `dtsu666.yaml`), so the map is **not fully standard** on our unit. Any address below is a candidate, not a promise.
- The FoxESS inverter masters the live RS-485 bus — a second master can't coexist. Probe against the **USB-RS485 → Modbus-TCP bridge at `172.26.68.1:502` (slave 1)**, or an isolated segment. Same access path as bank A. See [`../../../ha-config/scripts/SNIFF.md`](../../../ha-config/scripts/SNIFF.md).

## Where to look

The DTSU666 keeps its **system-parameter block in the low holding-register range** (FC03), the same area that holds Modbus address, baud, parity, protocol, and CT/PT ratios. If a model/version or serial-ish code exists, it is most likely here.

- **`0x0000`–`0x0030`** — primary parameter block. **Start here:** read the whole range as raw registers and dump it. Expect to find the configured **Modbus slave address**, **baud/parity**, **protocol code**, and **CT/PT ratio**. A **product/model/version code** sometimes appears in this block on Chint firmwares — but it identifies the _model family_ (DTSU666 vs DDSU666 vs DTSU666-H), **not a per-unit serial**.
- **`0x0030`–`0x0080`** — secondary config / clock / pulse-output params on some firmwares. Worth a follow-up sweep only if `0x0000`–`0x0030` hints at structured data continuing upward.

Read as **raw `uint16`** first (do _not_ assume FP32 here — config registers are usually integer fields, often packed), high-word-first per the rest of this unit (`mbpoll -B`). Decode meaning only after seeing the raw dump; don't pre-bake addresses into `dtsu666.yaml`.

## What "identity" we already have (and why it may be enough)

None of these is a factory-unique ID, but together they identify the install:

- **Modbus slave address** (`unit_id: 1`, confirmed on the meter's front panel) — _assigned_, not unique.
- **CT/PT ratio + protocol** — describe the install, not the unit.

Per grimoire's agnostic rule, **instance identity belongs in the deploying repo** (`sites/<name>/`), not on the meter — derive a stable id from `(bus, unit_id)` or a site-assigned label. A real hardware serial would be a bonus, not a dependency.

## Next step

Write a committed `bun run` analysis script (per the repo's "analysis is committed" rule) that reads `0x0000`–`0x0030` over the TCP bridge and dumps raw `uint16` words. That settles empirically what _this_ firmware answers, instead of guessing addresses. If a stable per-unit code turns up, add it to `dtsu666.yaml` as a linked register and delete this note's "unconfirmed" caveat.
