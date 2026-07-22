#!/usr/bin/env node
// Re-vendor the third-party Vale styles (write-good, proselint) from `.vale.ini`'s
// `Packages`, then apply the house deltas so a sync is one idempotent step:
//   1. `vale sync` — fetch styles into styles/<pkg>/.
//   2. drop the README.md each package ships — not a rule, and its upstream prose
//      trips the gate that lints styles/ like any other markdown.
//   3. re-apply the house message on write-good.Passive — sync overwrites it, so we
//      patch the one `message:` line in place (no token-list copy = no duplication).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const here = new URL('..', import.meta.url).pathname;
const run = (...a) => execFileSync('vale', a, { cwd: here, stdio: 'inherit' });

run('--config=.vale.ini', 'sync');

for (const pkg of ['write-good', 'proselint']) {
	rmSync(`${here}styles/${pkg}/README.md`, { force: true });
}

const passive = `${here}styles/write-good/Passive.yml`;
const HOUSE =
	"message: \"'%s' is copula padding — cut the is/are and state it active ('X is required' -> 'requires X').\"";
const patched = readFileSync(passive, 'utf8').replace(/^message:.*$/m, HOUSE);
writeFileSync(passive, patched);
