// Public entry for @nodeve/grimoire. Concepts are authored once as YAML layers (concepts/README.md:
// property → features → archetypes); the codegen (`generate`) projects them to the baked artifacts
// under generated/, and this entry re-exports the model-independent kit consumers read: the
// deterministic sensor-ID builder, the display policy, the env overlay, the catalog + site loaders,
// the concept parsers, and the site-bake compiler.

// --- Deterministic sensor IDs: THE one id formula every generator projects names from ---
export { sensorId, type SensorIdParts } from './sensor-id.ts';

// --- Display policy: the authored per-quantity filter/publish policy for the HA-facing per-sensor
//     path. `displayPolicy` is the baked instance (generated from display-policy/sensors.yaml) —
//     consumers read it through this API, never the YAML; `displayPolicyFor` looks up a register. ---
export {
	DisplayPolicySchema,
	type DisplayPolicy,
	type DisplayPolicyEntry,
	type DisplayFilter,
	parseDisplayPolicy,
	displayPolicyFor,
	haEntityId,
} from './display-policy.ts';
export { displayPolicy } from './generated/display-policy.ts';

// --- Env overlay: schema-annotation-driven (`x-env-var`) env override/fill for deployment config ---
export { overlayEnvVars } from './env.ts';

// --- Catalog loader: resolve a baked device by its identity (archetype + slug) — the reference a
//     site's `catalog_item` names. THE one way JS/TS reads the generated/catalog/ grain ---
export {
	loadDevice,
	listDevices,
	modbusMediumOf,
	type CatalogIdentity,
	type CatalogDevice,
	type ModbusMedium,
	type ModbusRegister,
} from './catalog.ts';

// --- Site view: THE consumer SDK over a baked `site.generated.json` — resolve a `catalog_item`
//     through its site_catalog indirection, merge the slug patch onto the device, flatten to the
//     slug-bearing sensor list ha-config / esphome codegen iterate. No reshape; stays snake ---
export {
	openSite,
	type SiteView,
	type SiteBundle,
	type SiteSensor,
	type ResolvedDevice,
} from './site-view.ts';
export { type MeasurandCell, measurandCells, measurandSubTopic, isMeasurandFeature } from './measurand-tree.ts';

// --- Site bundle validation: the ONE schema check over a resolved site bundle. The bake runs it
//     before writing; any consumer loading a `site.generated.json` calls the same function to trust it ---
export { validateSite } from './validate-site.ts';

// --- Site loading: grimoire owns the baked-bundle shape + filename, NOT where sites live — the
//     deploying repo passes the path in (kit/site-load.ts). `bakeSite` is the compiler mechanism
//     (source YAML tree → validated bundle); the deployer owns resolving its sites dir + writing. ---
export { loadSiteBundle, resolveSite, siteConfigPath, SITE_BUNDLE_FILE } from './site-load.ts';
export { bakeSite } from './bake-site.ts';

// --- Concept parsing (kit/site.ts over generated/ — the baked compiled
//     schemas): ONE generic parse per concept + the topic/env derivations every consumer shares ---
export {
	conceptSchemas,
	type ConceptTypes,
	parseConcept,
	type SiteLocation,
	parseLocation,
	type AmbientTank,
	parseAmbientTank,
	type SolarArray,
	type SolarString,
	parseSolarArray,
	type SiteAdapter,
	type TapWindow,
	parseSiteAdapter,
	siteTopicPrefix,
	adapterTopicPrefix,
	tapWindowTopic,
	sensorStateTopic,
	type MqttConnection,
	parseMqttConnection,
	MQTT_ENV,
	MQTT_ENV_NAMES,
} from './site.ts';

// --- Vocab: agnostic enumerations baked from concepts/enumeration/<name>/*.yaml
//     (`pnpm generate`); `.crosswalk` projects a code to a borrowed vocabulary ---
export {
	ACCUMULATION,
	QUANTITY_KIND,
	type Vocab,
	type VocabCode,
	type Term,
	type TermRef,
} from './vocab.ts';
