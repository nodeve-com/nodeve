// THE postgres gate: the shipped `gen/nodeve.postgres.sql` must apply, and the
// real rows must land in it. The SQLite twin is `src/load.ts`; this proves the
// dialect SQLite cannot — native enum types reject a value SQLite's VARCHAR
// would have swallowed, and postgres owns the referential check itself.
//
//   node bin/check-db-pg.ts    gen/nodeve.postgres.sql + gen/catalog.json → throwaway db
//
// No pg driver and no second insert path: `inserts()` is pure, so the rows come
// off the SAME flattening `load.ts` uses, rendered as SQL text for `psql`.
//
// FK order is the one real difference between the dialects. SQLite defers every
// constraint by simply not enforcing on insert, leaving `foreign_key_check` as
// the gate. Postgres enforces per statement, so an unordered row-set would fail
// on the first facet that precedes its `node`. Rather than topologically sort
// (the thing the whole bundle design avoids), mark every FK deferrable and load
// inside one transaction: postgres then checks the entire graph at COMMIT. Same
// property, same one-shot timing, and postgres derives the constraint list from
// its own catalog — nothing here restates the schema.
//
// The cluster lives in gitignored gen/pg and is reused; only the first run pays
// initdb. The server starts on a unix socket in gen/ and always stops again.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { abs, read, write } from '../src/io.ts';
import { inserts, type Bundle } from '../src/load.ts';

const CLUSTER = abs('gen/pg');
const SOCKET = abs('gen');
const LOG = abs('gen/pg.log');
const SQL = abs('gen/pg-load.sql');
const USER = 'nodeve';
const DB = 'nodeve_check';

const run = (bin: string, args: string[]) =>
	execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** psql against the throwaway db, failing the process on the first SQL error. */
const psql = (args: string[]) =>
	run('psql', ['-v', 'ON_ERROR_STOP=1', '-h', SOCKET, '-U', USER, '-d', DB, '-q', ...args]);

/** A postgres literal. Numbers and booleans render bare; everything else is a
 * quoted string with doubled quotes — enum columns take their labels this way,
 * which is exactly what makes a bad label fail here. */
const literal = (value: unknown): string => {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
	return `'${String(value).replaceAll("'", "''")}'`;
};

/** A quoted identifier. The DDL already quotes what it must (`"end"` — reserved
 * in postgres, tolerated bare by SQLite in column position), so the INSERT has
 * to spell columns the same way. */
const ident = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** Rows as one INSERT per (table, column-signature) run, batched. Grouping by
 * signature is what `load.ts` already does for prepared statements — the same
 * shape, rendered instead of bound. */
function statements(bundle: Bundle): string[] {
	const batchByKey = new Map<string, { table: string; columns: string[]; tuples: string[] }>();

	for (const { table, row } of inserts(bundle)) {
		const columns = Object.keys(row).filter((c) => row[c] !== undefined);
		const key = `${table}(${columns.join(',')})`;
		let batch = batchByKey.get(key);
		if (!batch) {
			batch = { table, columns, tuples: [] };
			batchByKey.set(key, batch);
		}
		batch.tuples.push(`(${columns.map((c) => literal(row[c])).join(', ')})`);
	}

	return [...batchByKey.values()].map(
		({ table, columns, tuples }) =>
			`INSERT INTO ${ident(table)} (${columns.map(ident).join(', ')}) VALUES\n${tuples.join(',\n')};`,
	);
}

function stopServer() {
	try {
		run('pg_ctl', ['-D', CLUSTER, '-m', 'immediate', 'stop']);
	} catch {
		// already down — the only state this needs
	}
}

for (const path of [abs('gen/nodeve.postgres.sql'), abs('gen/catalog.json')])
	if (!existsSync(path)) {
		console.error(`missing ${path} — run: pnpm project`);
		process.exit(1);
	}

// Reuse survives only while the cluster matches the server on PATH. A postgres
// major bump leaves a PG_VERSION the new binary reads as a corrupt control file
// — throwaway state, so re-initdb rather than report it. Both majors are read
// from the tools themselves; neither is spelled here.
const serverMajor = run('pg_ctl', ['--version']).trim().split(' ').at(-1)?.split('.')[0];
const clusterMajor = existsSync(CLUSTER) ? read(`${CLUSTER}/PG_VERSION`).trim() : serverMajor;
if (clusterMajor !== serverMajor) {
	console.log(`gen/pg is postgres ${clusterMajor}, server is ${serverMajor} — reinitializing`);
	rmSync(CLUSTER, { recursive: true, force: true });
}

if (!existsSync(CLUSTER))
	run('initdb', ['-D', CLUSTER, '-U', USER, '--auth=trust', '-E', 'UTF8', '--no-sync']);

stopServer();
run('pg_ctl', ['-D', CLUSTER, '-o', `-k ${SOCKET} -h "" -F`, '-l', LOG, '-w', 'start']);

try {
	run('dropdb', ['-h', SOCKET, '-U', USER, '--if-exists', DB]);
	run('createdb', ['-h', SOCKET, '-U', USER, DB]);
	psql(['-f', abs('gen/nodeve.postgres.sql')]);

	// Every FK, named by postgres itself, made deferrable so one transaction can
	// carry the unordered bundle and COMMIT adjudicates the whole graph.
	const defer = psql([
		'-t',
		'-A',
		'-c',
		`SELECT format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED;',
		               conrelid::regclass, conname)
		 FROM pg_constraint WHERE contype = 'f'`,
	]);

	const bundle = JSON.parse(read(abs('gen/catalog.json'))) as Bundle;
	const rows = statements(bundle);
	write(SQL, [defer, 'BEGIN;', 'SET CONSTRAINTS ALL DEFERRED;', ...rows, 'COMMIT;'].join('\n'));
	psql(['-f', SQL]);

	// `coordinate` is the one shipped object postgres would accept unparsed and
	// never run — select from it, and compare the total to what `load.ts` reports.
	const [nodes, coordinates] = psql([
		'-t',
		'-A',
		'-c',
		'SELECT count(*) FROM node',
		'-c',
		'SELECT count(*) FROM coordinate',
	])
		.trim()
		.split('\n');
	const fks = defer.split('\n').filter(Boolean).length;
	console.log(
		`ok postgres: ${nodes} nodes loaded, ${coordinates} coordinates, ${fks} foreign keys validated at COMMIT`,
	);
} catch (error) {
	const detail = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
	console.error(detail.trim().split('\n').slice(0, 20).join('\n'));
	console.error('\npostgres DDL or rows rejected — see above');
	process.exitCode = 1;
} finally {
	stopServer();
	rmSync(SQL, { force: true });
}
