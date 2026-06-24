/**
 * The SvelteKit vitest project split shared by every app: a browser "client"
 * project running the `*.svelte.{test,spec}` suites under Playwright, and a
 * node "server" project for the rest. See the JSDoc on the implementation in
 * `index.js` for the full rationale.
 *
 * `vitest/config` is resolved in the consuming app (every SvelteKit app already
 * depends on vitest), so this declaration carries the precise return type.
 */
export function vitestProjects(opts?: {
	/** Path the projects extend back to; defaults to `./vite.config.ts`. */
	extends?: string;
}): import('vitest/config').TestProjectConfiguration[];
