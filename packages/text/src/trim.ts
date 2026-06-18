export interface TrimTextOptions {
	/** Hard upper bound on returned length (before any ellipsis). */
	max: number;
	/**
	 * Minimum fraction of `max` a sentence-end cut must reach before it's
	 * preferred over a word-boundary cut. Default 0.6 — prevents picking a
	 * very early sentence end and discarding most of the budget.
	 */
	sentenceFloor?: number;
	/** Appended when the result is cut at a non-sentence boundary. */
	ellipsis?: string;
}

/**
 * Collapse whitespace and trim `text` to fit within `max` characters,
 * preferring a sentence boundary, falling back to a word boundary.
 * Returns the input unchanged when it already fits.
 */
export function trimText(text: string, opts: TrimTextOptions): string {
	const { max, sentenceFloor = 0.6, ellipsis = '…' } = opts;
	const collapsed = text.replace(/\s+/g, ' ').trim();
	if (collapsed.length <= max) return collapsed;

	const slice = collapsed.slice(0, max);
	const sentenceEnd = Math.max(
		slice.lastIndexOf('. '),
		slice.lastIndexOf('! '),
		slice.lastIndexOf('? '),
	);
	if (sentenceEnd >= max * sentenceFloor) return slice.slice(0, sentenceEnd + 1);

	const wordEnd = slice.lastIndexOf(' ');
	return (wordEnd > 0 ? slice.slice(0, wordEnd) : slice) + ellipsis;
}
