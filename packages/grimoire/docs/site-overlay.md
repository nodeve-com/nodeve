# site overlay — how a site patches a base catalog device

A `site_catalog` entry names a grimoire device (`inventory.catalog_item`) and adds the facts the site knows that the datasheet can't: the on-bus sensor slugs, plus device facts like a NIC's `mac_address`. Those additions ship as one **sparse patch** (`inventory.catalog_patch`) that consumers deep-merge onto the loaded device. This doc is the single source for the whole chain — how the bake writes that patch and how the reader applies it.

## The two halves of a reference

- `catalog_item` — the POINTER: `{archetype, slug}` naming the grimoire device (or a site-local entry).
- `catalog_patch` — what the SITE ADDS to it: a sparse tree mirroring the device's own shape, each leaf a value the site supplies. Free-form by design (`additionalProperties: true`) — its shape is the referenced device's, which no static schema can know.

## Authoring — write device facts at the top level

A `site_catalog` entry owns exactly its `thing` identity + the `inventory` feature: `identity` / `title` / `description` / `refs` / `inventory`. **Any other top-level key overlays the referenced device.** Author it in the device's own shape:

```yaml
# sites/<name>/catalog/grid_inverter.yaml
inventory:
  serial_number: 60P11030588M005
  catalog_item: { slug: foxess_h3_ps10sh, archetype: inverter }

network_interfaces: # a device feature (is_array) — overlay, not a site_catalog key
  - identity: { slug: eth0 } # matched to the device's NIC by identity.slug
    network_link: { mac_address: 94:51:dc:00:7b:d7 }
  - identity: { slug: wlan0 }
    network_link: { mac_address: 94:51:dc:00:7b:d4 }
```

## Bake — [`generate-site.ts`](../scripts/generate-site.ts) folds overlay into the patch

For each `site_catalog` entry the bake:

1. Projects the measurand slug patch (`{feature}.feature_spec.{combined|part|instances}.{qk}.identity.slug`) from the referenced device's specification tree — the deterministic on-bus ids.
2. **Folds every non-site_catalog top-level key** (the authored overlay above) into that same patch and strips it from the entry — so the entry validates as a pure `site_catalog` and the whole overlay rides `inventory.catalog_patch`.

The patch is the only thing that travels in `site.generated.json`; the merge is not materialised.

## Apply — [`site-view.ts`](../kit/site-view.ts) `overlayPatch` merges by identity

Consumers `openSite(bundle).resolve(ref)` → `{ device, patch, merged }`. `overlayPatch` deep-merges the patch onto the device. Objects recurse and leaves overlay as expected; **arrays have two shapes**:

- **identity-keyed** — every base element carries `identity.slug` (e.g. `network_interfaces`). The merge matches each patch element to its base element **by slug**, so a site's authored `[eth0, wlan0]` overlays a device's `[wlan0, eth0]` onto the RIGHT NIC. A plain index merge would swap the `mac_address`es. A patch element whose slug isn't on the device appends (the site adds a NIC the datasheet omits).
- **positional** — ordinal-keyed measurand `instances` (no `identity`): merged by index, as before.

Identity-keyed matching is what "overlay based on the identity" means: the merge key is the element's `identity.slug`, not its position. `slug` is the common case; the rule keys on `identity.slug` presence.
