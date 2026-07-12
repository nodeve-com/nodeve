// nodeve's own check config — dogfoods @nodeve/checks. We have no apps/, so the
// doc budget guards the READMEs and reshape/inline-dupes scan packages/.
// inline-dupes runs on packages/ at full strength: the bins' shared prologue now
// lives in lib/bin.ts (one typed `Gate`), so there's no cross-file repetition
// left for it to flag. helper-collisions runs against the committed
// `.nodeve/lib-names.json` (remeda + date-fns exports) — regen with
// `nodeve-build-lib-names` after a bump so a local fn can't quietly reinvent a
// blessed-lib function.
export default {
	docTokens: {
		globs: ['README.md', 'packages/*/README.md'],
	},
	reshape: {
		globs: ['packages/*.ts'],
	},
	// TEMPORARY: grimoire's generated/ still has codegen-inherent clones jscpd flags — compose-merge
	// field runs (a view reusing a sibling's columns) + identical atom-import runs. The data-tree
	// de-normalization is done (inverter.json 6.3MB→7KB, referential); making `compose` emit
	// referentially is the deferred "if/when needed" step in docs/data-tree-normalization.md. Remove
	// this ignore once compose is referential.
	clones: {
		ignore: ['packages/grimoire/generated/**'],
	},
	helperCollisions: {
		libs: ['remeda', 'date-fns'],
	},
	requireDeps: {
		deps: ['remeda', 'date-fns'],
	},
};
