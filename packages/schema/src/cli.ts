#!/usr/bin/env node
// nodeve-schema CLI — the discovery surface. A consumer with no checkout reads
// `nodeve-schema` (no args) to learn what the package does, then normalizes its
// own tree without writing a line of TS. Same functions the library exports.
import { dumpJson, write } from './io.ts';
import { buildCatalog } from '../normalize/catalog.ts';
import { normalize } from '../normalize/normalize.ts';

const HELP = `nodeve-schema — authored yaml → catalog rows (JSON to stdout or a file)

  nodeve-schema catalog <dir> [out]   a tree of <sql_table>/<slug>.yaml dirs → the
                                      catalog bundle load() ingests. Writes [out],
                                      or prints when it is absent.
  nodeve-schema rows <file>           one authored doc → its rows, the debug view:
                                      the dir names the table, the filename the slug.

A bundle concatenates: append your row-sets to the shipped @nodeve/schema/catalog.json,
load the union, and the FKs resolve across both (load defers to foreign_key_check).
The schema-projected row-sets (properties, node_type stubs) ride the shipped bundle
alone — \`--schema-rows\` re-emits them, which only the package owning the schema does.`;

const args = process.argv.slice(2);
const schemaRows = args.includes('--schema-rows');
const [command, first, second] = args.filter((a) => a !== '--schema-rows');

if (command === 'catalog' && first) {
	const bundle = buildCatalog(first, { schemaRows });
	if (second) {
		write(second, dumpJson(bundle));
		console.error(
			Object.entries(bundle)
				.map(([slot, rows]) => `${rows.length} ${slot}`)
				.join(', ') + ` → ${second}`,
		);
	} else console.log(dumpJson(bundle));
} else if (command === 'rows' && first) {
	console.log(dumpJson(normalize(first), 2));
} else {
	console.log(HELP);
	process.exitCode = command ? 1 : 0;
}
