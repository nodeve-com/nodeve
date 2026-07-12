// grimoire owns the *shape* of a baked site on disk — it WRITES `<sitesDir>/<name>/site.generated.json`
// (the site-bake tooling), so it owns reading it back and the filename convention. It does NOT own
// *where* that tree lives: site instances live in the deploying repo (concepts/README.md), so the
// consumer passes the location in. grimoire never resolves a sites path from its own installed
// location — as a published dependency that would point into `node_modules/`, not the consumer's
// sites/ tree. A consumer that wants a lone artifact detached from the tree just passes its full path
// straight to `loadSiteBundle`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SiteBundle } from './site-view.ts';

/** The baked-bundle filename grimoire writes (and reads) under each site's dir. */
export const SITE_BUNDLE_FILE = 'site.generated.json';

/** Absolute path to a site's compiled bundle, given the deploying repo's sites dir. */
export function siteConfigPath(sitesDir: string, site: string): string {
	return join(sitesDir, site, SITE_BUNDLE_FILE);
}

/** Which install a build/script targets — NEVER a constant. The caller passes the selected name
 *  (from its own argv or deploy env); grimoire only enforces that one was chosen, so no site is ever
 *  assumed. */
export function resolveSite(site: string | undefined): string {
	if (!site) throw new Error('no site selected: pass a site name (e.g. from argv or your deploy env)');
	return site;
}

/** Load + JSON-parse a baked site bundle from an explicit path (compose it with `siteConfigPath`, or
 *  pass a lone artifact's path directly). Blocks stay loose; validate at use. */
export function loadSiteBundle(path: string): SiteBundle {
	return JSON.parse(readFileSync(path, 'utf8')) as SiteBundle;
}
