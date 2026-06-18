// nodeve's own check config — dogfoods @nodeve/checks. We have no apps/, so the
// doc budget guards the READMEs and reshape scans packages/. inline-dupes and
// helper-collisions stay on their apps/-scoped defaults (no match here): a CLI
// tool package's intentionally-parallel bins aren't the app-route duplication
// those checks target.
export default {
	docTokens: {
		enforce: ['README.md', 'packages/*/README.md'],
	},
	reshape: {
		globs: ['packages/*.ts'],
	},
};
