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
		enforce: ['README.md', 'packages/*/README.md'],
	},
	reshape: {
		globs: ['packages/*.ts'],
	},
	helperCollisions: {
		libs: ['remeda', 'date-fns'],
	},
	requireDeps: {
		deps: ['remeda', 'date-fns'],
	},
};
