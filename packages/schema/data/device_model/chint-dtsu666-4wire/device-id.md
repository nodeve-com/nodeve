# DTSU666 — is there a device ID? (open investigation)

**Status: unconfirmed.** Unique hardware/serial register missing from published DTSU666 documents. This entry maps only the measurement banks (A `0x2000`, B `0x1510`/`0x1000`), no config/identity block. This note records where an identifier _could_ live — none confirmed readable on our unit's firmware.

## Why this is hard

- This firmware returns **"Illegal data address"** on the `0x4000` energy block, so the map is **not fully standard** here. Every address below is a candidate, not a promise.
- The FoxESS inverter masters the live RS-485 bus; a second master can't coexist. Probe against the **USB-RS485 → Modbus-TCP bridge (`172.26.68.1:502`, slave 1)** or an isolated segment — same path as bank A. See [`../../../ha-config/scripts/SNIFF.md`](../../../ha-config/scripts/SNIFF.md).

## Where to look

The DTSU666 holds its **system-parameter block in the low holding-register range** (FC03) — Modbus address, baud, parity, protocol, CT/PT ratios. A model/version or serial code, if any, sits here.

- **`0x0000`–`0x0030`** — primary parameter block. **Start here:** dump the range raw. Expect the **Modbus slave address**, **baud/parity**, **protocol code**, **CT/PT ratio**. A **product/model/version code** appears here on some Chint firmwares — but identifies the _model family_ (DTSU666 vs DDSU666 vs DTSU666-H), **not a per-unit serial**.
- **`0x0030`–`0x0080`** — secondary config / clock / pulse-output on some firmwares. Sweep only if `0x0000`–`0x0030` hints at structured data continuing upward.

Read **raw `uint16`** first (config registers are integer, often packed — not FP32), high-word-first (`mbpoll -B`). Decode only after seeing the dump; don't pre-bake addresses.

## Identity we already have (why it may be enough)

None is a factory-unique ID, but together they identify the install:

- **Modbus slave address** (`unit_id: 1`, front-panel confirmed) — _assigned_, not unique.
- **CT/PT ratio + protocol** — describe the install, not the unit.

Per the agnostic rule, **instance identity belongs in the deploying repo** (`sites/<name>/`), not on the meter — derive a stable id from `(bus, unit_id)` or a site label. A hardware serial is a bonus, not a dependency.

## Probe

Commit an analysis script reading `0x0000`–`0x0030` over the TCP bridge, dumping raw `uint16` words — settles empirically what this firmware answers. If a stable per-unit code turns up, add it as a linked register and drop the "unconfirmed" caveat.
