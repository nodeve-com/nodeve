// Rows → SQLite. The TS twin of what `ddl.py dump` did through linkml's ORM,
// so a downstream runtime can load its own normalized rows without python.
//
//   node src/load.ts    gen/nodeve.sql + gen/catalog.json → gen/catalog.db
//
// The `Catalog` container is load machinery, never a table: each top-level
// row-set inserts straight into its class's `sql_table`. Nested facets flatten
// on the way in, two shapes and no others (17 sites in the catalog today):
//
//   inlined LIST   parent.<slot>: [ {…} ]  → child rows + `<parent_table>_node`
//   inlined SINGLE parent.<slot>: {…}      → child row  + `<slot>_node` on the parent
//
// A class reached from several parents (`ref`, `domain_member`) carries one
// nullable backref per referencing parent and fills the one it arrived through.
//
// SQLite does not enforce FKs on insert, so row-sets load in ANY order and
// `foreignKeyCheck` is the one integrity gate, run once at the end. That is
// what lets a downstream bundle concatenate its own rows onto the catalog's
// with no topological sort.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { abs, read, remove } from './io.ts';
import { classByName, slotByName, type SlotDef } from '../normalize/model.ts';

export type TableRow = Record<string, unknown>;
export type Bundle = Record<string, TableRow[]>;

/** one pending INSERT — the table and the flat row that lands in it */
type Insert = { table: string; row: TableRow };

const CONTAINER = 'Catalog';

/** a class's sql_table, or undefined where the class is not table-backed */
const tableOf = (className: string): string | undefined =>
	classByName[className]?.annotations?.sql_table;

/** the slot as `parentClass` sees it — a class attribute wins over the global */
const slotOf = (parentClass: string, slot: string): SlotDef | undefined =>
	classByName[parentClass]?.attributes?.[slot] ?? slotByName[slot];

/** node:sqlite binds no booleans — SQLite has no boolean type either. Every
 * other value reaching here is already a JSON scalar: `destructure` consumed the
 * objects, so nothing composite survives to be bound. */
const bind = (value: unknown): SQLInputValue =>
	typeof value === 'boolean' ? Number(value) : (value as SQLInputValue);

/** Flatten one authored row into its own INSERT plus every nested child's,
 * stamping the FK that ties them. Scalars pass through untouched. */
function destructure(className: string, row: TableRow, out: Insert[]): TableRow {
	const table = tableOf(className);
	if (!table) throw new Error(`${className}: no sql_table annotation, cannot load`);
	const flat: TableRow = {};

	for (const [slot, value] of Object.entries(row)) {
		const range = slotOf(className, slot)?.range;
		const childTable = range ? tableOf(range) : undefined;

		// a string at an FK slot is a reference, not an inlined child — pass it
		if (!childTable || value === null || typeof value !== 'object') {
			flat[slot] = value;
			continue;
		}
		if (Array.isArray(value)) {
			for (const child of value as TableRow[])
				destructure(range!, { ...child, [`${table}_node`]: row.node }, out);
			continue;
		}
		// inlined single: the child owns its row, the parent points forward at it
		const child = destructure(range!, value as TableRow, out);
		flat[`${slot}_node`] = child.node;
	}

	out.push({ table, row: flat });
	return flat;
}

/** Every INSERT a bundle implies, in bundle order. Pure — no database touched,
 * so a caller can merge two bundles' inserts, or diff them. */
export function inserts(bundle: Bundle): Insert[] {
	const rowSets = classByName[CONTAINER]?.attributes;
	if (!rowSets) throw new Error(`schema has no ${CONTAINER} container class`);
	const out: Insert[] = [];

	for (const [slot, rows] of Object.entries(bundle)) {
		const range = rowSets[slot]?.range;
		if (!range) throw new Error(`${slot}: not a ${CONTAINER} row-set`);
		for (const row of rows) destructure(range, row, out);
	}
	return out;
}

/** Insert every row into an already-DDL'd database, one transaction, prepared
 * statements reused across rows sharing a column signature.
 *
 * FK enforcement is suspended for the transaction and restored after — a facet
 * row routinely lands before the `node` its PK references, and ordering the
 * whole graph buys nothing when `foreignKeyCheck` proves the same thing once at
 * the end. node:sqlite enables constraints by default, unlike the sqlite CLI. */
export function load(db: DatabaseSync, bundle: Bundle): number {
	const statementByKey = new Map<string, ReturnType<DatabaseSync['prepare']>>();
	const all = inserts(bundle);
	const enforcing = (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
		.foreign_keys;

	db.exec('PRAGMA foreign_keys = OFF');
	db.exec('BEGIN');
	for (const { table, row } of all) {
		const columns = Object.keys(row).filter((c) => row[c] !== undefined);
		const key = `${table}(${columns.join(',')})`;
		let statement = statementByKey.get(key);
		if (!statement) {
			const marks = columns.map(() => '?').join(', ');
			statement = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks})`);
			statementByKey.set(key, statement);
		}
		statement.run(...columns.map((c) => bind(row[c])));
	}
	db.exec('COMMIT');
	if (enforcing) db.exec('PRAGMA foreign_keys = ON');
	return all.length;
}

/** THE integrity gate: every assembled path must land on a real row. SQLite
 * declares FKs but does not enforce them, so this is the only thing that does. */
export function foreignKeyCheck(db: DatabaseSync): TableRow[] {
	return db.prepare('PRAGMA foreign_key_check').all() as TableRow[];
}

/** DDL text + rows → a fresh database at `path`, replacing any existing one. */
export function buildDatabase(path: string, ddl: string, bundle: Bundle): DatabaseSync {
	const db = new DatabaseSync(path);
	db.exec(ddl);
	load(db, bundle);
	const bad = foreignKeyCheck(db);
	if (bad.length)
		throw new Error(
			`foreign_key_check: ${bad.length} dangling FK rows, e.g. ${JSON.stringify(bad.slice(0, 5))}`,
		);
	return db;
}

if (import.meta.main) {
	const path = abs('gen/catalog.db');
	remove(path);
	const bundle = JSON.parse(read(abs('gen/catalog.json'))) as Bundle;
	const db = buildDatabase(path, read(abs('gen/nodeve.sql')), bundle);
	const rows = db.prepare('SELECT count(*) n FROM node').get() as { n: number };
	db.close();
	console.log(`${rows.n} nodes → gen/catalog.db`);
}
