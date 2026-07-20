#!/usr/bin/env node
// `grimoire-scribe` — convert a YAML source tree to canonical JSON (defaults folded, identity
// stamped, comment blocks rejected). Two modes:
//
//   grimoire-scribe <srcDir> <destDir>   write the JSON mirror under destDir
//   grimoire-scribe <srcDir> [--stdout]  dump the whole tree as one JSON object (relPath → doc)
//
// `--concept-rules` turns on the concept-authoring raw gates (no oversized comment blocks, no empty
// leaf) — grimoire's own concept tree uses it; plain conversion stays permissive. A downstream
// package feeds its own concept/site YAML through the SAME step grimoire uses — pipe the stdout form
// into a build, or materialize a mirror to read alongside the shipped artifacts.

import { type ScribeOptions, scribeObject, scribeToDir } from './index.ts';

function main(argv: string[]): void {
	const opts: ScribeOptions = { conceptRules: argv.includes('--concept-rules') };
	const positional = argv.filter((a) => !a.startsWith('--'));
	const [src, dest] = positional;
	const stdout = argv.includes('--stdout');
	if (!src) {
		process.stderr.write(
			'usage: grimoire-scribe <srcDir> <destDir> [--concept-rules]\n' +
				'       grimoire-scribe <srcDir> [--stdout] [--concept-rules]   (dump one JSON object to stdout)\n',
		);
		process.exit(2);
	}
	if (!dest || stdout) {
		process.stdout.write(`${JSON.stringify(scribeObject(src, opts), null, '\t')}\n`);
		return;
	}
	const n = scribeToDir(src, dest, opts);
	process.stderr.write(`grimoire-scribe: wrote ${n} JSON files to ${dest}\n`);
}

main(process.argv.slice(2));
