/**
 * A field real users never see or fill. Render it hidden from people (not
 * `type="hidden"`, which bots skip) and drop any submission that fills it,
 * answering as if it succeeded so bots learn nothing.
 */
export const HONEYPOT_FIELD = 'website';

export function isHoneypotFilled(
	form: FormData | Record<string, unknown>,
	field: string = HONEYPOT_FIELD,
): boolean {
	const value = form instanceof FormData ? form.get(field) : form[field];
	return typeof value === 'string' && value.length > 0;
}
