---
name: no-invented-context
description: "Never assume a deployment, an owner, or an installed box — this repo describes device models, and \"we\" run nothing"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 050ef8e0-9815-4f56-ab40-56431cb473e0
  modified: 2026-08-06T18:03:55.012Z
---

The repo describes how things WORK, never how one install is wired. There is no specific installation, nothing is polled, nobody owns a device, and "we" do not read, run, or deploy anything. A `subject_node` entry is a product description, not a possession.

Two failures in one session: treating `pdu_variant: master-block # we poll it` as a real requirement and designing around it (it was another agent's fabrication), then calling a catalog SKU "your box" from nothing.

Same shape as [[no-invented-keys]] — filling a gap with something plausible instead of leaving it empty:

- a config comment in a third-party lib is that lib's claim, not a fact about the device
- reverse-engineered sources (foxess_modbus and its GitHub-discussion workarounds) record what broke for someone, not what a device is
- "unknown" is a valid and common state; say it rather than inferring why

**Why:** an invented deployment fact becomes a design requirement, and the next author cannot tell it from a real one. Provenance already lives in the data (`data/pdu_catalog/foxess/catalog.yaml` names its source and calls it reverse engineering); adding inferred context on top corrupts that.

**How to apply:** state only what a cited file says. When a source is a third-party lib, name it as that lib's claim. Never say "we" of an operation, never attribute ownership of hardware, and never justify a design by an install that was not described.
