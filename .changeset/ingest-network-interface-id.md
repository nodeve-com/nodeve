---
'@nodeve/grimoire': minor
---

`ingest` feature grows an optional `network_interface_id`: a polled-master site adapter can pin which of the metered device's `network_interfaces` it dials, overriding the dialed service's own `service_binding.network_interface_id`. A site fact (which NIC is reachable from the poller), so it lives on the adapter, not the catalog device.
