import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from './turnstile.js';

afterEach(() => vi.unstubAllGlobals());

function answer(body: unknown) {
	const fetch = vi.fn(async () => Response.json(body));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

describe('verifyTurnstile', () => {
	it('fails a missing token without calling Cloudflare', async () => {
		const fetch = answer({ success: true });
		expect(await verifyTurnstile({ secret: 's', token: null })).toEqual({
			ok: false,
			errorCodes: ['missing-input-response'],
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('passes Cloudflare’s verdict through', async () => {
		answer({ success: false, 'error-codes': ['timeout-or-duplicate'] });
		expect(await verifyTurnstile({ secret: 's', token: 't' })).toEqual({
			ok: false,
			errorCodes: ['timeout-or-duplicate'],
		});
		answer({ success: true });
		expect(await verifyTurnstile({ secret: 's', token: 't', remoteip: '1.2.3.4' })).toEqual({
			ok: true,
			errorCodes: [],
		});
	});
});
