/**
 * Apple's Hide My Email relay domain.
 *
 * Verification providers (DeBounce, Bouncify) report these as invalid because
 * Apple rejects SMTP probes, yet they deliver. Skip remote verification for
 * them rather than trust that verdict.
 */
export const APPLE_RELAY_DOMAIN = 'privaterelay.appleid.com';

/** Is this an Apple Hide My Email relay address? Case-insensitive. */
export function isAppleRelayEmail(address: string): boolean {
	return address.toLowerCase().endsWith(`@${APPLE_RELAY_DOMAIN}`);
}
