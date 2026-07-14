import charmap from './charmap.json' with { type: 'json' };

const transliterate = (input: string): string =>
	[...input]
		.map((ch) => {
			const mapped = (charmap as Record<string, string>)[ch];
			return mapped && mapped.length > 1 ? ` ${mapped} ` : (mapped ?? ch);
		})
		.join('');

/**
 * Convert a string to a URL-safe slug.
 *
 * Transliterates special characters via charmap, expands mid-string `@` to
 * "at", then uses `toKebabCase` for word splitting and lowercasing. Strips
 * any remaining non-alphanumeric characters.
 */
export function slugify(input: string): string {
	const expanded = transliterate(input)
		.replace(/['']/g, '')
		.replace(/(?<=\S)\s*@\s*(?=\S)/g, ' at ');
	return expanded
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Build a slug guaranteed unique within `seen`, then record it.
 *
 * - If the slugified `input` is empty (no usable chars), uses `${fallbackPrefix}-${suffix}`.
 * - If the candidate already exists in `seen`, appends `-${suffix}` until unique.
 * - Mutates `seen` by adding the returned slug.
 *
 * `suffix` is supplied by the caller — typically a stable id-derived value
 * (e.g. last 6 chars of an external id) so collisions are deterministic across
 * runs. Pass a unique suffix per input or expect an infinite loop.
 */
// @TODO migrate on next major release.
// eslint-disable-next-line max-params
export function uniqueSlug(
	input: string,
	suffix: string,
	seen: Set<string>,
	fallbackPrefix = 'item',
): string {
	const base = slugify(input);
	let slug = base || `${fallbackPrefix}-${suffix}`;
	while (seen.has(slug)) slug = `${slug}-${suffix}`;
	seen.add(slug);
	return slug;
}
