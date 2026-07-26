---
'@nodeve/schema': minor
---

Model the site layer, so a deployment's own tree normalizes into rows beside the catalog's.

New facets:

- `Location` — a geodetic point. Columns, not intervals: a point has no band and no sensor.
- `IpBinding`, plus `NetworkInterface.mac_address`.
- `Endpoint` — one host and protocol version per node, never repeated on each binding.
- `Filter` — the interval width facet stating WHAT the band claims over: a 1 s mean, not raw samples.
- `Site`, `Authentication`, `PvString`.

New node types `site`, `service-host` and `solar-array`, plus feature sockets and address rows on `site-catalog`. `Ingest` now names the surface it dials — `service_protocol` plus a NIC pin.

Two normalizer fixes this is the first data to need. A `device` FK now takes its trail (`inverter/foxess-h3-ps10sh`), because a node whose class declares `path_root` roots at its kind, never at its table. And a `network_interface` reference resolves on any row-set, against the row's `device` when it names one — an adapter dials the metered node's interfaces, not its own.

**Breaking for authors:** devices move to `data/subject_node/<node_type>/<slug>/` and drop their `node_type:` key. The path is the identity, so the kind is the directory; two kinds may then share one slug, which a site needs. Permalinks stay byte-identical.
