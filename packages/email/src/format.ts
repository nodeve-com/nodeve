/**
 * Render a mailbox as a display string. Returns `"Name" <addr>` when a display
 * name is present, otherwise the bare address. Use at presentation boundaries
 * where the original RFC 5322 `raw` source isn't available; prefer the raw
 * header text when you have it.
 */
export function formatMailbox(name: string | null | undefined, address: string): string {
	const trimmed = name?.trim();
	return trimmed ? `"${trimmed}" <${address}>` : address;
}
