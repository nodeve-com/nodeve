/**
 * Server-side Cloudflare Turnstile check. The widget's token is single-use
 * and expires after five minutes; verify it before anything else in the
 * handler. Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Form field the widget writes its token to. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

export type TurnstileResult = { ok: boolean; errorCodes: string[] };

export type VerifyTurnstileOptions = {
	secret: string;
	token: string | null | undefined;
	/** Visitor IP (`CF-Connecting-IP`), optional. */
	remoteip?: string | null;
};

export async function verifyTurnstile({
	secret,
	token,
	remoteip,
}: VerifyTurnstileOptions): Promise<TurnstileResult> {
	if (!token) return { ok: false, errorCodes: ['missing-input-response'] };
	const body = new FormData();
	body.append('secret', secret);
	body.append('response', token);
	if (remoteip) body.append('remoteip', remoteip);
	const response = await fetch(SITEVERIFY_URL, { method: 'POST', body });
	const result = (await response.json()) as { success: boolean; 'error-codes'?: string[] };
	return { ok: result.success, errorCodes: result['error-codes'] ?? [] };
}
