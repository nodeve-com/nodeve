#!/usr/bin/env node
// grimoire CLI — query the baked artifacts/ JSON (snake wire shape, the same files every non-TS
// reader gets) from a shell, instead of grepping node_modules or `node -e` against the module
// surface. Reads fs by design: a bin, not the serverless runtime path (src/catalog.ts stays fs-free).
//
// Two halves: the CATALOG side (`catalog`/`registers`) queries agnostic device instances; the CONCEPT
// side (`feature`/`archetype`/`property`/`part`/`enumeration`/`schema`) queries the SCHEMA — what a
// thing IS. Every concept node carries its own prose (`body`/`description`/`title`) inline, so
// `grimoire feature interval` answers "what is an interval" without reading source or dist `.d.ts`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACTS_DIR } from './concept-sources.ts';

const USAGE = `grimoire — query the baked @nodeve/grimoire artifacts (JSON to stdout)

CATALOG (agnostic device instances):
  grimoire catalog                     list entries: archetype_id  slug  code
  grimoire catalog <slug> [path]       one entry, full snake wire JSON; a dotted path selects a
                                       node (e.g. ac_phase_three_grid.feature_spec.combined)
  grimoire registers <slug> [column]   the entry's modbus register rows; column filters on quantity_kind

CONCEPTS (the schema — what a thing IS; each node carries its own body/description/title prose):
  grimoire feature [<slug> [path]]     list features, or dump one (e.g. \`feature interval\` — what an interval is)
  grimoire archetype [<slug> [path]]   list archetypes, or dump one (\`archetype intervals\` — the interval item type)
  grimoire property [<slug> [path]]    list properties, or dump one (\`property duration\`)
  grimoire part [<slug> [path]]        list parts, or dump one
  grimoire enumeration [<name> [code]] list enumerations, or dump a member dict / one member
  grimoire schema <kind> <slug>        the JSON Schema twin (kind: feature|archetype|property|catalog);
                                       append \`camel\` for the camelCase sibling

The TS module surface (\`modbusMediumOf\`, \`intervalSensorId\`, imported concept types) is documented in
the package README ("Using the catalog" / "Using the concepts"); concepts/README.md is the model.
`;

// command → artifacts/ subdir for the generic list/dump concept path (singular reads better).
const CONCEPT_DIR: Record<string, string> = {
	feature: 'features',
	archetype: 'archetypes',
	property: 'property',
	part: 'parts',
};

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

// Walk a dotted path into an already-read node; array indices are numeric segments. Dies with the
// available keys at the point it fails, so a wrong path teaches the right one.
function selectPath(root: unknown, path: string | undefined, ctx: string): unknown {
	let node = root;
	for (const key of path === undefined ? [] : path.split('.')) {
		const parent = node as Record<string, unknown> | unknown[];
		node = Array.isArray(parent) ? parent[Number(key)] : parent?.[key as never];
		if (node === undefined)
			die(`${ctx}: no "${key}" in path "${path}" (have: ${Object.keys(parent ?? {}).join(', ')})`);
	}
	return node;
}

// List a concept dir as `slug<TAB>title` (title aids discovery), or dump one entry / a path into it.
function concept(dir: string, slug?: string, path?: string): void {
	if (slug !== undefined) return print(selectPath(readEntry(dir, slug), path, `${dir}/${slug}`));
	for (const stem of jsonStems(dir)) {
		const { title } = readEntry(dir, stem) as { title?: { en?: string } };
		console.log(`${stem}\t${title?.en ?? ''}`);
	}
}

function catalog(slug?: string, path?: string): void {
	if (slug !== undefined)
		return print(selectPath(readEntry('catalog', slug), path, `catalog/${slug}`));
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

// The JSON Schema twin: `<slug>.schema.json` (snake wire contract) or `.camel.schema.json` sibling.
function schema(kind?: string, slug?: string, variant?: string): void {
	const dir = kind === 'catalog' ? 'catalog' : kind && CONCEPT_DIR[kind];
	if (!dir || slug === undefined)
		die(`schema needs <kind> <slug> (kind: ${['catalog', ...Object.keys(CONCEPT_DIR)].join('|')})`);
	const ext = variant === 'camel' ? '.camel.schema.json' : '.schema.json';
	const file = join(ARTIFACTS_DIR, dir, `${slug}${ext}`);
	try {
		print(JSON.parse(readFileSync(file, 'utf8')));
	} catch {
		die(
			`no schema ${dir}/${slug}${ext} (list with: grimoire ${kind === 'catalog' ? 'catalog' : (kind ?? '')})`,
		);
	}
}

const [command, ...rest] = process.argv.slice(2);
// An asked-for help is a success: USAGE to stdout, exit 0. An unknown command is an error: USAGE to
// stderr, exit 1 (the `die` path below). No command at all is an error too — nothing was queried.
if (command === 'help' || command === '-h' || command === '--help') {
	console.log(USAGE);
} else if (command !== undefined && command in CONCEPT_DIR) {
	concept(CONCEPT_DIR[command]!, rest[0], rest[1]);
} else {
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
		case 'schema':
			schema(rest[0], rest[1], rest[2]);
			break;
		default:
			die(USAGE);
	}
}
