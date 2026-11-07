/**
 * Opt-in staff alerts. Each Editor/Admin chooses in the newsroom whether they
 * want an email for new contact messages and/or new comments awaiting review.
 * Alerts contain a link to the protected newsroom, never the private message.
 * Throttled to one alert per kind per 15 minutes.
 */
import { checkRateLimits } from "../security/rate-limit";
import { nowIso, type SqlDb } from "../db/sql";
import { sendEmail, type MailSettings } from "./send";

export type AlertKind = "inquiries" | "comments";

export interface AlertPrefs {
	inquiries: boolean;
	comments: boolean;
}

export async function getAlertPrefs(db: SqlDb, userId: string): Promise<AlertPrefs> {
	const row = await db
		.prepare(`SELECT inquiries, comments FROM as_alert_prefs WHERE user_id = ?`)
		.bind(userId)
		.first<{ inquiries: number; comments: number }>();
	return { inquiries: Number(row?.inquiries ?? 0) === 1, comments: Number(row?.comments ?? 0) === 1 };
}

export async function setAlertPrefs(db: SqlDb, userId: string, prefs: AlertPrefs): Promise<void> {
	await db
		.prepare(
			`INSERT INTO as_alert_prefs (user_id, inquiries, comments, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT (user_id) DO UPDATE SET inquiries = excluded.inquiries,
			   comments = excluded.comments, updated_at = excluded.updated_at`,
		)
		.bind(userId, prefs.inquiries ? 1 : 0, prefs.comments ? 1 : 0, nowIso())
		.run();
}

/** Opted-in, active Editors/Admins; falls back to the configured editorial address. */
export async function alertRecipients(db: SqlDb, kind: AlertKind, fallback: string): Promise<string[]> {
	const column = kind === "inquiries" ? "p.inquiries" : "p.comments";
	const { results } = await db
		.prepare(
			`SELECT u.email AS email FROM as_alert_prefs p JOIN users u ON u.id = p.user_id
			 WHERE ${column} = 1 AND u.disabled = 0 AND u.role >= 40`,
		)
		.all<{ email: string }>();
	const emails = results.map((row) => row.email);
	if (emails.length === 0 && fallback) emails.push(fallback);
	return [...new Set(emails)].slice(0, 20);
}

export async function sendStaffAlert(
	db: SqlDb,
	mail: MailSettings,
	options: { kind: AlertKind; origin: string; fallback: string },
): Promise<number> {
	const throttle = await checkRateLimits(db, [
		{ bucket: `alert:${options.kind}`, key: "all", limit: 1, windowSeconds: 900 },
	]);
	if (!throttle.allowed) return 0;
	const recipients = await alertRecipients(db, options.kind, options.fallback);
	const link =
		options.kind === "inquiries" ? `${options.origin}/newsroom/inbox` : `${options.origin}/newsroom/comments`;
	const subject =
		options.kind === "inquiries"
			? "رسالة جديدة في صندوق Arabs Startups"
			: "تعليق جديد بانتظار المراجعة — Arabs Startups";
	const text = [
		options.kind === "inquiries"
			? "وصلت رسالة جديدة عبر نموذج التواصل."
			: "وصل تعليق جديد بانتظار المراجعة.",
		"",
		`افتح غرفة الأخبار: ${link}`,
		"",
		"لا يتضمّن هذا التنبيه نصّ الرسالة لحماية خصوصية المرسل.",
		"يمكنك إيقاف التنبيهات من صفحة غرفة الأخبار.",
	].join("\n");
	let sent = 0;
	for (const to of recipients) {
		const result = await sendEmail(db, mail, { to, subject, text });
		if (result.ok) sent += 1;
	}
	return sent;
}
