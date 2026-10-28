# @nodeve/web-form

Server-side spam defenses for public forms. Runs on Workers and Node. Email quality checks: `@nodeve/email`.

## `@nodeve/web-form/turnstile`

`verifyTurnstile({ secret, token, remoteip? })` → `{ ok, errorCodes }`. A missing token fails without a request. `TURNSTILE_FIELD` is the form field the widget writes its token to.

```ts
import { TURNSTILE_FIELD, verifyTurnstile } from '@nodeve/web-form/turnstile';

const check = await verifyTurnstile({
	secret: env.TURNSTILE_SECRET,
	token: form.get(TURNSTILE_FIELD)?.toString(),
	remoteip: request.headers.get('CF-Connecting-IP'),
});
if (!check.ok) return fail(400, { error: 'Please retry the check.' });
```

## `@nodeve/web-form/honeypot`

`isHoneypotFilled(form, field = HONEYPOT_FIELD)`: true when a bot filled the trap field. Hide the field from people with CSS and `tabindex="-1" autocomplete="off"`, not `type="hidden"`. On true, answer as if the submit succeeded.
