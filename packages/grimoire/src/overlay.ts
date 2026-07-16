// Sparse-patch overlay — the ONE merge both sides of the `catalog_patch` chain use: the site bake
// folding authored site keys onto the generated slug patch, and the site-view reader folding that
// patch onto the loaded grimoire device. Not remeda.mergeDeep: that REPLACES arrays, but a patch
// array is sparse and must merge element-wise onto the base's.

import { isPlainObject } from 'remeda';
import type { Obj } from './measurand-tree.ts';

// The `identity.slug` handle of an array element, or undefined for a positionally-keyed one.
const slugKey = (el: unknown): string | undefined =>
	isPlainObject(el) && isPlainObject(el.identity)
		? ((el.identity as Obj).slug as string | undefined)
		: undefined;

function overlayIdentityArray(base: unknown[], patch: unknown[]): unknown[] {
	const merged = base.map((element) => {
		const matching = patch.find((candidate) => slugKey(candidate) === slugKey(element));
		return matching === undefined ? element : overlayPatch(element, matching);
	});
	for (const element of patch)
		if (!base.some((candidate) => slugKey(candidate) === slugKey(element))) merged.push(element);
	return merged;
}

// Two array shapes coexist:
//   • IDENTITY-KEYED — every base element carries `identity.slug` (network_interfaces NICs, slugged
//     `intervals`). Match patch elements to base by slug, so a site's authored [eth0, wlan0] overlays
//     a device's [wlan0, eth0] onto the RIGHT NIC (an index merge would swap the mac_addresses). A
//     patch element whose slug isn't on the base is APPENDED (the site adds a NIC the datasheet
//     doesn't list, or a custom interval band).
//   • POSITIONAL — measurand `instances` (ordinal-keyed, no identity): merge by index.
// The patch only ever ADDS leaves; objects recurse, leaves overlay.
export function overlayPatch(base: unknown, patch: unknown): unknown {
	if (Array.isArray(base) && Array.isArray(patch)) {
		if (base.length > 0 && base.every((el) => slugKey(el) !== undefined))
			return overlayIdentityArray(base, patch);
		return base.map((el, i) => overlayPatch(el, patch[i]));
	}
	if (isPlainObject(base) && isPlainObject(patch)) {
		const out: Obj = { ...base };
		for (const [k, v] of Object.entries(patch)) out[k] = overlayPatch(base[k], v);
		return out;
	}
	return patch === undefined ? base : patch;
}
