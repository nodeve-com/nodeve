/**
 * The check registry — every check the gate knows about, in a sensible run
 * order. The `nodeve-check` dispatcher resolves a subcommand against `byName`
 * and runs the whole `pre-commit` set for a bare `nodeve-check`. `commit-msg`
 * lives here too but runs on its own hook (it needs the message file), so the
 * suite run skips it.
 */
import { catalog } from '../checks/catalog.js';
import { clones } from '../checks/clones.js';
import { commitMsg } from '../checks/commit-msg.js';
import { docTokens } from '../checks/doc-tokens.js';
import { fileSize } from '../checks/file-size.js';
import { helperCollisions } from '../checks/helper-collisions.js';
import { inlineDupes } from '../checks/inline-dupes.js';
import { pageSize } from '../checks/page-size.js';
import { pluralArrays } from '../checks/plural-arrays.js';
import { requireDeps } from '../checks/require-deps.js';
import { requireEslint } from '../checks/require-eslint.js';
import { reshape } from '../checks/reshape.js';
import { type Check } from './runner.js';

export const CHECKS: Check[] = [
	docTokens,
	reshape,
	pluralArrays,
	fileSize,
	pageSize,
	inlineDupes,
	helperCollisions,
	clones,
	catalog,
	requireDeps,
	requireEslint,
	commitMsg,
];

/** Checks the bare-`nodeve-check` suite runs — every pre-commit check. */
export const PRE_COMMIT = CHECKS.filter((c) => c.name !== commitMsg.name);

export const byName = new Map(CHECKS.map((c) => [c.name, c]));
