// Deterministic JSON serialization shared by every emit (generate.ts, kit/emit-types.ts):
// sorted keys + trailing newline, so a committed mirror only changes when the source does.

/** Stable key ordering so serialized output is deterministic across runs. */
export const sortKeys = (_key: string, value: unknown): unknown =>
	value && typeof value === 'object' && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
		: value;

/** The exact JSON file contents to commit (deterministic, trailing newline). */
export const renderJson = (value: unknown): string => `${JSON.stringify(value, sortKeys, 2)}\n`;
