/**
 * One ZeptoMail send: a single authenticated POST. No SDK — the `zeptomail`
 * package pulls in `node-fetch` and Node built-ins, dead weight on Workers.
 *
 * Docs: https://www.zoho.com/zeptomail/help/api/email-sending.html
 */
const ZEPTOMAIL_URL = 'https://api.zeptomail.com/v1.1/email';

export type Mailbox = { address: string; name: string };

export type SendMailOptions = {
	/** `Zoho-enczapikey …` send-mail token. */
	token: string;
	from: Mailbox;
	to: Mailbox;
	subject: string;
	htmlbody?: string;
	textbody?: string;
	replyTo?: Mailbox;
};

export async function sendMail({
	token,
	from,
	to,
	subject,
	htmlbody,
	textbody,
	replyTo,
}: SendMailOptions): Promise<void> {
	const response = await fetch(ZEPTOMAIL_URL, {
		method: 'POST',
		headers: {
			Authorization: token,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			from,
			to: [{ email_address: to }],
			subject,
			...(htmlbody && { htmlbody }),
			...(textbody && { textbody }),
			...(replyTo && { reply_to: [replyTo] }),
		}),
	});
	if (!response.ok) {
		throw new Error(`ZeptoMail ${response.status}: ${await response.text().catch(() => '')}`);
	}
}
