// The PERMANENT site-concept surface (PLANS/deterministic-sensor-ids.md "consumer swap"):
// ONE generic parse over the baked concept schemas (generated/index.ts — compiled
// from the YAML layers by `pnpm generate`; no YAML on the runtime path), plus the
// topic/env derivations every consumer shares.

import { snakeKeyByCamel } from '@nodeve/schema-case';
import { type ConceptTypes, conceptSchema } from './generated/index.ts';
import { parseSnake } from './parse.ts';
import type { SiteBundle } from './site-view.ts';

export type { ConceptTypes };
export { conceptSchema };

/** Rename snake_case `data` to camel (mapping-driven, BEFORE validation), validate against the
 *  concept's baked camelCase TypeBox schema — THE one parse every consumer of a concept instance
 *  goes through. The schema is a live `Type.*` value (no fs). */
export function parseConcept<K extends keyof ConceptTypes>(concept: K, data: unknown): ConceptTypes[K] {
	return parseSnake<ConceptTypes[K]>(conceptSchema[concept], data, `${concept} config`);
}

export type MqttConnection = ConceptTypes['mqttConnection'];
export const parseMqttConnection = (data: unknown): MqttConnection => parseConcept('mqttConnection', data);

// --- Site adapters: the install's decoder peers. A `site_adapter` is an ordinary concept parsed
//     through `parseConcept` like every other; nothing bespoke. What IS shared lives in the topic
//     layer below — every published path roots at the connection's `emit.topic_prefix`, extended by
//     the adapter's own slug (`<topic_prefix>/<slug>/…`). ---

export type SiteAdapter = ConceptTypes['siteAdapter'];
export type TapWindow = NonNullable<SiteAdapter['modbusTapWindow']>[number];

/** Validate + camelCase one adapter. The `modbus_tap`-windows-iff-modbus_tap cross-field rule is
 *  enforced once at bake by `validateSite` (kit/validate-site.ts), not re-checked per read. */
export const parseSiteAdapter = (data: unknown): SiteAdapter => parseConcept('siteAdapter', data);

/** The site-wide sensor-data topic root: the connection's `emit.topic_prefix` — the ONE prefix every
 *  published sensor path roots at, before any adapter slug. Extracted HERE so no consumer re-reaches
 *  into `mqtt_connection` (distinct from infra-web's own network-data prefix). Throws when unset. */
export const siteTopicPrefix = (bundle: SiteBundle): string => {
	const prefix = parseMqttConnection(bundle.mqtt_connection).emit?.topicPrefix;
	if (!prefix) throw new Error('site mqtt config declares no emit.topic_prefix (the sensor topic root)');
	return prefix;
};

/** An adapter's topic root: the connection's shared `topic_prefix` extended by the adapter's slug
 *  (`<topic_prefix>/<slug>`). The one place root ⊕ adapter compose — spanning both, so it lives
 *  here, not on either concept. */
export const adapterTopicPrefix = (topicPrefix: string, adapter: SiteAdapter): string => {
	const slug = adapter.identity?.slug;
	if (!slug) throw new Error('site_adapter has no identity.slug to root its topics on');
	return `${topicPrefix}/${slug}`;
};

/** The full topic a tap window's grouped cycle rides — `<topic_prefix>/<slug>/<ingest_kind>/<window
 *  name>`. The single derivation every consumer shares; throws when the named window isn't declared. */
export const tapWindowTopic = (topicPrefix: string, adapter: SiteAdapter, windowName: string): string => {
	const window = adapter.modbusTapWindow?.find((w) => w.name === windowName);
	if (!window) throw new Error(`adapter "${adapter.identity?.slug}" declares no tap window "${windowName}"`);
	return `${adapterTopicPrefix(topicPrefix, adapter)}/${adapter.ingest?.ingestKind}/${window.name}`;
};

/** The per-sensor HA-facing state topic — `<topic_prefix>/<slug>/sensor/<name>/state`. Every sink
 *  and consumer derives the string HERE, never hand-spells it. `name` is one flat topic segment. */
export const sensorStateTopic = (topicPrefix: string, adapter: SiteAdapter, name: string): string => {
	if (!/^[a-z0-9_]+$/.test(name))
		throw new Error(`sensor name "${name}" is not a flat slug (one lowercase topic segment)`);
	return `${adapterTopicPrefix(topicPrefix, adapter)}/sensor/${name}/state`;
};

// --- MQTT env-var names: derived from the baked schema's `x-env-var` annotations ---

// Walk a schema's `properties` tree and collect every `x-env-var`, keyed by the SNAKE field path
// joined with `_` (the schema is camel; each node's `x-key-map` gives the source spelling back) —
// the projection that turns the self-describing schema into a flat name map, stable across casings.
function collectEnvVars(schema: unknown, prefix: readonly string[] = []): Record<string, string> {
	const props = (schema as { properties?: Record<string, unknown> }).properties;
	if (!props) return {};
	const snakeOf = snakeKeyByCamel(schema);
	const out: Record<string, string> = {};
	for (const [key, sub] of Object.entries(props)) {
		const path = [...prefix, snakeOf[key] ?? key];
		const name = (sub as { 'x-env-var'?: string })['x-env-var'];
		if (typeof name === 'string') out[path.join('_')] = name;
		Object.assign(out, collectEnvVars(sub, path));
	}
	return out;
}

// The CANONICAL env-var names a deployment supplies each connection field under — DERIVED from
// the schema's `x-env-var` annotations, so the names live in ONE place and can't drift.
export const MQTT_ENV: Readonly<Record<string, string>> = collectEnvVars(conceptSchema.mqttConnection);

/** Every canonical MQTT_* env var name (guard-mqtt-env.sh's allow-list). */
export const MQTT_ENV_NAMES: readonly string[] = [...new Set(Object.values(MQTT_ENV))];
