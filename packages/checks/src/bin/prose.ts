#!/usr/bin/env node
// nodeve-prose — the ad-hoc half of the prose gate. The commit hook runs `vale`
// on staged docs and groups the failures; this bin runs the SAME house rules on
// whatever paths you pass, from any CWD, with no `--config` to remember and one
// error per line (`file:line:col:rule:message`) so an editor can jump to each.
//
// The config lives beside this package (`.vale.ini`, StylesPath resolves next to
// it), so a consumer never authors or syncs a Vale config. `vale` itself must be
// on PATH — it ships in the nix devShell.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const config = join(dirname(fileURLToPath(import.meta.url)), '../../.vale.ini');
const targets = process.argv.slice(2);

if (!targets.length) {
	console.error('usage: nodeve-prose <file.md | dir> …  — org prose rules, one error per line');
	process.exit(2);
}

const r = spawnSync('vale', [`--config=${config}`, '--output=line', ...targets], {
	stdio: 'inherit',
});
if (r.error) {
	console.error('✖ vale not on PATH — the org prose gate needs it (nix devShell: `nix develop`).');
	process.exit(1);
}
process.exit(r.status ?? 0);
