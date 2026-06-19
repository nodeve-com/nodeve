/**
 * Greedy word-wrap: break `text` into lines no longer than `maxChars`, splitting
 * only on whitespace. Runs of whitespace collapse to one break. A single word
 * longer than `maxChars` keeps its own line and overflows — words are never split
 * mid-character. Returns `[]` for blank input.
 */
export function wrapText(text: string, maxChars: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const max = Math.max(1, Math.floor(maxChars));

	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		if (!line) line = word;
		else if (line.length + 1 + word.length <= max) line += ` ${word}`;
		else {
			lines.push(line);
			line = word;
		}
	}
	lines.push(line);
	return lines;
}
