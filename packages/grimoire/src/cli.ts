#!/usr/bin/env node
// grimoire CLI — query the baked artifacts/ JSON (snake wire shape, the same files every non-TS
// reader gets) from a shell, instead of grepping node_modules or `node -e` against the module
// surface. Reads fs by design: a bin, not the serverless runtime path (src/catalog.ts stays fs-free).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACTS_DIR } from './concept-sources.ts';

const USAGE = `grimoire — query the baked @nodeve/grimoire artifacts (JSON to stdout)

  grimoire catalog                     list entries: archetype_id  slug  code
  grimoire catalog <slug> [path]       one entry, full snake wire JSON; a dotted path selects a
                                       node (e.g. ac_phase_three_grid.feature_spec.combined)
  grimoire registers <slug> [column]   the entry's modbus register rows; column filters on quantity_kind
  grimoire enumeration                 list enumeration names
  grimoire enumeration <name> [code]   member dict, or one member
`;

function die(message: string): never {
	console.error(message);
	process.exit(1);
}

const print = (value: unknown): void => console.log(JSON.stringify(value, null, 2));

const jsonStems = (dir: string): string[] =>
	readdirSync(join(ARTIFACTS_DIR, dir))
		.filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json'))
		.map((f) => f.slice(0, -'.json'.length))
		.sort();

function readEntry(dir: string, stem: string): Record<string, unknown> {
	const stems = jsonStems(dir);
	if (!stems.includes(stem)) die(`no ${dir}/${stem} (have: ${stems.join(', ')})`);
	return JSON.parse(readFileSync(join(ARTIFACTS_DIR, dir, `${stem}.json`), 'utf8')) as Record<
		string,
		unknown
	>;
}

function catalog(slug?: string, path?: string): void {
	if (slug !== undefined) {
		let node: unknown = readEntry('catalog', slug);
		for (const key of path === undefined ? [] : path.split('.')) {
			const parent = node as Record<string, unknown> | unknown[];
			node = Array.isArray(parent) ? parent[Number(key)] : parent?.[key as never];
			if (node === undefined)
				die(
					`catalog/${slug}: no "${key}" in path "${path}" (have: ${Object.keys(parent ?? {}).join(', ')})`,
				);
		}
		return print(node);
	}
	for (const stem of jsonStems('catalog')) {
		const { identity } = readEntry('catalog', stem) as {
			identity: { archetype_id: string; slug: string; code: string };
		};
		console.log(`${identity.archetype_id}\t${identity.slug}\t${identity.code}`);
	}
}

function registers(slug?: string, column?: string): void {
	if (slug === undefined) die(USAGE);
	const modbus = readEntry('catalog', slug).modbus as
		{ modbus_registers?: Array<{ quantity_kind?: string }> } | undefined;
	if (!modbus?.modbus_registers) die(`catalog/${slug} has no modbus register map`);
	const rows = modbus.modbus_registers;
	if (column === undefined) return print(rows);
	const hits = rows.filter((r) => r.quantity_kind === column);
	if (hits.length === 0) {
		const cols = [...new Set(rows.map((r) => r.quantity_kind).filter(Boolean))];
		die(
			`catalog/${slug} has no register with column "${column}" (have: ${cols.sort().join(', ')})`,
		);
	}
	print(hits);
}

function enumeration(name?: string, code?: string): void {
	if (name === undefined) return jsonStems('enumeration').forEach((s) => console.log(s));
	const members = readEntry('enumeration', name);
	if (code === undefined) return print(members);
	if (!(code in members))
		die(`no enumeration/${name} member "${code}" (have: ${Object.keys(members).join(', ')})`);
	print(members[code]);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
	case 'catalog':
		catalog(rest[0], rest[1]);
		break;
	case 'registers':
		registers(rest[0], rest[1]);
		break;
	case 'enumeration':
		enumeration(rest[0], rest[1]);
		break;
	default:
		die(USAGE);
}
