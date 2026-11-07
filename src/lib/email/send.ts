/**
 * Outbound email.
 *
 * Production uses Resend (RESEND_API_KEY). Without a key, production refuses
 * to send and the UI says so; local development writes to a dev outbox table
 * instead, so flows can be tested without a mail provider.
 * Messages are plain text, so no HTML can be injected into anyone's inbox.
 */
import { newId, nowIso, type SqlDb } from "../db/sql";

export interface OutboundEmail {
	to: string;
	subject: string;
	text: string;
	replyTo?: string;
}

export type SendResult =
	| { ok: true; providerId: string }
	| { ok: false; reason: "not_configured" | "provider_error" | "invalid_recipient" };

export interface MailSettings {
	resendApiKey: string;
	mailFrom: string;
	devOutbox: boolean;
	fetchImpl?: typeof fetch;
}

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
const LINE_BREAKS = /[\r\n]+/g;

export function oneLine(value: string, max = 200): string {
	return value.replace(LINE_BREAKS, " ").trim().slice(0, max);
}

export async function sendEmail(db: SqlDb, settings: MailSettings, email: OutboundEmail): Promise<SendResult> {
	const to = email.to.trim();
	if (!EMAIL_RE.test(to) || to.length > 254) return { ok: false, reason: "invalid_recipient" };
	const subject = oneLine(email.subject);
	const replyTo = email.replyTo && EMAIL_RE.test(email.replyTo.trim()) ? email.replyTo.trim() : undefined;

	if (settings.resendApiKey) {
		try {
			const response = await (settings.fetchImpl ?? fetch)("https://api.resend.com/emails", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${settings.resendApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from: settings.mailFrom,
					to: [to],
					subject,
					text: email.text,
					...(replyTo ? { reply_to: replyTo } : {}),
				}),
				signal: AbortSignal.timeout(10_000),
			});
			if (!response.ok) return { ok: false, reason: "provider_error" };
			const data = (await response.json()) as { id?: string };
			return data.id ? { ok: true, providerId: `resend:${data.id}` } : { ok: false, reason: "provider_error" };
		} catch {
			return { ok: false, reason: "provider_error" };
		}
	}

	if (settings.devOutbox) {
		const id = newId();
		await db
			.prepare(`INSERT INTO as_dev_outbox (id, to_addr, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, to, subject, email.text, nowIso())
			.run();
		return { ok: true, providerId: `dev-outbox:${id}` };
	}

	return { ok: false, reason: "not_configured" };
}

export function isEmailConfigured(settings: MailSettings): boolean {
	return !!settings.resendApiKey || settings.devOutbox;
}
