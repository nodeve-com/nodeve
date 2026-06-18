// nodeve's own check config — dogfoods @nodeve/checks. We have no apps/, so the
// doc budget guards the READMEs and reshape/inline-dupes scan packages/.
// inline-dupes runs on packages/ at full strength: the bins' shared prologue now
// lives in lib/bin.ts (one typed `Gate`), so there's no cross-file repetition
// left for it to flag. helper-collisions stays on its default (no lib-names
// index → no-op).
export default {
	docTokens: {
		enforce: ['README.md', 'packages/*/README.md'],
	},
	reshape: {
		globs: ['packages/*.ts'],
	},
};
