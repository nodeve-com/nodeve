// Referential gate for condition pointers (concepts/features/condition.yaml), per catalog entry:
//   • `interval_item` {feature, property, interval} must resolve WITHIN the entry — the named
//     feature exists, carries that property in its feature_spec, and one of that property's
//     intervals answers to the slug (authored or rating-desugared — run AFTER desugarIntervalSlugs).
//   • `setting` must be a key in the entry's `settings_schema`, and `equals` a member of that
//     key's `enum` when one is declared.
// BUILD- AND TEST-ONLY, like the rest of the emit gate.

import { isPlainObject } from 'remeda';
import type { Obj } from '../src/concept-sources.ts';

type Targets = Map<string, Map<string, Set<string>>>;

/** Fold one spec node's quantities into the feature's property → interval-slug map. */
function collectNodeSlugs(node: unknown, byProperty: Map<string, Set<string>>): void {
	if (!isPlainObject(node)) return;
	for (const [property, spec] of Object.entries(node)) {
		if (!isPlainObject(spec) || !Array.isArray(spec.intervals)) continue;
		const slugs = byProperty.get(property) ?? new Set<string>();
		for (const row of spec.intervals) {
			const slug =
				isPlainObject(row) && isPlainObject(row.identity) ? (row.identity as Obj).slug : undefined;
			if (typeof slug === 'string') slugs.add(slug);
		}
		byProperty.set(property, slugs);
	}
}

/** feature → property → the slugs its intervals answer to, unioned across every spec node
 *  (combined, part.<name>, instances[n]). */
function intervalTargets(entry: Obj): Targets {
	const out: Targets = new Map();
	for (const [feature, value] of Object.entries(entry)) {
		if (!isPlainObject(value) || !isPlainObject(value.feature_spec)) continue;
		const fs = value.feature_spec as Obj;
		const byProperty = new Map<string, Set<string>>();
		const nodes = [
			fs.combined,
			...Object.values(isPlainObject(fs.part) ? fs.part : {}),
			...(Array.isArray(fs.instances) ? fs.instances : []),
		];
		for (const node of nodes) collectNodeSlugs(node, byProperty);
		out.set(feature, byProperty);
	}
	return out;
}

/** Resolve one (feature, property, interval) by-slug triple against the entry's interval targets —
 *  shared by interval_item conditions and measurand-link registers (features/measurand_link.yaml
 *  reuses the SAME pointer: feature_id + quantity_kind + interval). `kind` names the caller in errors. */
function checkTriple(
	feature: unknown,
	property: unknown,
	interval: unknown,
	targets: Targets,
	at: string,
	kind: string,
): void {
	const byProperty = targets.get(String(feature));
	if (!byProperty)
		throw new Error(`${at}: ${kind} names feature "${String(feature)}" — no such spec feature on this entry`);
	const slugs = byProperty.get(String(property));
	if (!slugs)
		throw new Error(
			`${at}: ${kind} names ${String(feature)}.${String(property)} — the feature carries no such property`,
		);
	if (!slugs.has(String(interval)))
		throw new Error(
			`${at}: ${kind} names interval "${String(interval)}" on ${String(feature)}.${String(property)} — no interval answers to it (have: ${[...slugs].join(', ') || 'none'})`,
		);
}

function checkIntervalItem(item: Obj, targets: Targets, at: string): void {
	const { feature, property, interval } = item as Record<string, unknown>;
	checkTriple(feature, property, interval, targets, at, 'interval_item');
}

/** A LINKED register naming a measurable channel by `interval_id` must resolve (feature_id,
 *  quantity_kind, interval_id) — the same triple interval_item uses (interval_id = its `interval`
 *  coordinate). Registers without `interval_id` (the one undirected/lifetime channel) and RAW
 *  registers are skipped. */
function checkRegisterInterval(reg: unknown, targets: Targets, at: string): void {
	if (!isPlainObject(reg) || typeof reg.interval_id !== 'string') return;
	checkTriple(reg.feature_id, reg.quantity_kind, reg.interval_id, targets, at, 'register interval_id');
}

function checkSetting(row: Obj, settings: Obj | undefined, at: string): void {
	const key = String(row.setting);
	const properties =
		settings && isPlainObject(settings.properties) ? (settings.properties as Obj) : undefined;
	const schema = properties?.[key];
	if (!isPlainObject(schema))
		throw new Error(`${at}: setting "${key}" is not a key in this entry's settings_schema`);
	if (Array.isArray(schema.enum) && !schema.enum.includes(row.equals))
		throw new Error(
			`${at}: setting "${key}" never equals ${JSON.stringify(row.equals)} — settings_schema allows ${JSON.stringify(schema.enum)}`,
		);
}

/** The entry-scoped resolution context every gate checks against. */
type Ctx = { targets: Targets; settings?: Obj };

function checkConditionRow(row: unknown, ctx: Ctx, at: string): void {
	if (!isPlainObject(row)) return;
	if (isPlainObject(row.interval_item))
		checkIntervalItem(row.interval_item as Obj, ctx.targets, at);
	if (row.setting !== undefined) checkSetting(row, ctx.settings, at);
}

/** Validate every condition gate on the resolved entry — throws on a dangling pointer. */
export function validateConditionRefs(entry: Obj, path: string): void {
	const ctx: Ctx = {
		targets: intervalTargets(entry),
		settings: isPlainObject(entry.settings_schema) ? (entry.settings_schema as Obj) : undefined,
	};
	const walk = (node: unknown, at: string): void => {
		if (Array.isArray(node)) {
			node.forEach((v, i) => walk(v, `${at}[${i}]`));
			return;
		}
		if (!isPlainObject(node)) return;
		for (const [k, v] of Object.entries(node)) {
			if (k === 'condition' && Array.isArray(v))
				v.forEach((row, i) => checkConditionRow(row, ctx, `${at}.condition[${i}]`));
			else walk(v, `${at}.${k}`);
		}
	};
	walk(entry, path);

	// Modbus register links reuse the interval_item pointer (feature_id + quantity_kind + interval_id).
	const medium = isPlainObject(entry.modbus) ? (entry.modbus as Obj) : undefined;
	const registers = medium && Array.isArray(medium.modbus_registers) ? medium.modbus_registers : [];
	registers.forEach((reg, i) =>
		checkRegisterInterval(reg, ctx.targets, `${path}.modbus.modbus_registers[${i}]`),
	);
}
