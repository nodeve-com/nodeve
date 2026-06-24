import { playwright } from '@vitest/browser-playwright';

/**
 * The SvelteKit vitest project split shared by every app: a browser "client"
 * project running the `*.svelte.{test,spec}` suites under Playwright, and a
 * node "server" project for the rest. This is the boilerplate `sv create`
 * scaffolds identically into each app's vite config; centralizing it keeps the
 * two projects in lockstep and out of the copy-paste gate.
 *
 * Both projects `extends` the app's own config so they inherit its plugins and
 * resolve wiring. An app with an extra project (e.g. a Storybook project, which
 * stays per-app — its `configDir` and plugin can't be made generic) spreads
 * this and appends its own:
 *
 *   test: { projects: [...vitestProjects(), storybookProject] }
 *
 * `@vitest/browser-playwright` is an optional peer — install it wherever this
 * export is consumed (every SvelteKit app already has it for the browser tests).
 *
 * @param {object} [opts]
 * @param {string} [opts.extends] Path the projects extend back to; defaults to
 *   the conventional `./vite.config.ts`.
 * @returns {import('vitest/config').TestProjectConfiguration[]}
 */
export function vitestProjects({ extends: extendsPath = './vite.config.ts' } = {}) {
	return [
		{
			extends: extendsPath,
			test: {
				name: 'client',
				browser: {
					enabled: true,
					provider: playwright(),
					instances: [{ browser: 'chromium', headless: true }],
				},
				include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				exclude: ['src/lib/server/**'],
			},
		},
		{
			extends: extendsPath,
			test: {
				name: 'server',
				environment: 'node',
				include: ['src/**/*.{test,spec}.{js,ts}'],
				exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
			},
		},
	];
}
