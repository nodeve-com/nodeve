export type DamerauLevenshteinResult = {
	steps: number;
	relative: number;
	similarity: number;
};

function distanceMatrix(aLen: number, bLen: number): number[][] {
	const infinity = aLen + bLen;
	const matrix: number[][] = Array.from({ length: aLen + 2 }, () => new Array(bLen + 2).fill(0));
	matrix[0][0] = infinity;
	for (let i = 0; i <= aLen; i++) [matrix[i + 1][0], matrix[i + 1][1]] = [infinity, i];
	for (let j = 0; j <= bLen; j++) [matrix[0][j + 1], matrix[1][j + 1]] = [infinity, j];
	return matrix;
}

function nextDistance(
	matrix: number[][],
	position: { i: number; j: number; iPrev: number; jPrev: number; cost: number },
) {
	const { i, j, iPrev, jPrev, cost } = position;
	return Math.min(
		matrix[i][j] + cost,
		matrix[i + 1][j] + 1,
		matrix[i][j + 1] + 1,
		matrix[iPrev][jPrev] + (i - iPrev - 1) + 1 + (j - jPrev - 1),
	);
}

export function damerauLevenshtein(a: string, b: string): DamerauLevenshteinResult {
	const aLen = a.length;
	const bLen = b.length;

	if (aLen === 0) return score(bLen, bLen);
	if (bLen === 0) return score(aLen, aLen);

	// True Damerau-Levenshtein (unrestricted). The matrix has an extra sentinel
	// row and column so transposition lookups at the edge fall through to a
	// value larger than any reachable distance (aLen + bLen).
	const matrix = distanceMatrix(aLen, bLen);

	// Last row index in the matrix at which each character was seen in a.
	const lastRow = new Map<string, number>();

	for (let i = 1; i <= aLen; i++) {
		const ai = a[i - 1];
		let lastMatchCol = 0; // last column in b where b[col-1] === some a[k-1] for k <= i
		for (let j = 1; j <= bLen; j++) {
			const bj = b[j - 1];
			const iPrev = lastRow.get(bj) ?? 0;
			const jPrev = lastMatchCol;
			const cost = ai === bj ? 0 : 1;

			// Transposition: swap a[iPrev..i-1] with b[jPrev..j-1], where iPrev/jPrev
			// point at matching characters. The (i-iPrev-1) + 1 + (j-jPrev-1) term is
			// the cost of deleting the gap in a, one swap, and inserting the gap in b.
			matrix[i + 1][j + 1] = nextDistance(matrix, { i, j, iPrev, jPrev, cost });

			if (cost === 0) lastMatchCol = j;
		}
		lastRow.set(ai, i);
	}

	return score(matrix[aLen + 1][bLen + 1], Math.max(aLen, bLen));
}

function score(steps: number, length: number): DamerauLevenshteinResult {
	const relative = length === 0 ? 0 : steps / length;
	return { steps, relative, similarity: 1 - relative };
}
