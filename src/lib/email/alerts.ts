/**
 * Staff email alerts.
 *
 * - New contact messages and stories ("inquiries"): every active Contributor,
 *   Author, Editor and Admin gets one email per submission. On by default;
 *   an Editor/Admin can turn it off in the newsroom. Capped at 30 per hour so
 *   a flood cannot run up the mail bill.
 * - New comments awaiting review: opt-in, Editors/Admins only, at most one
 *   alert per 15 minutes.
 *
 * Alerts never contain the private message, the sender's name or email. Only
 * staff who can open the inbox (Editor and up) get the inbox link.
 */
import { checkRateLimits } from "../security/rate-limit";
import { nowIso, type SqlDb } from "../db/sql";
import { ROLE } from "../staff/roles";
import { renderEmailHtml } from "./layout";
import { sendEmail, type MailSettings } from "./send";

export type AlertKind = "inquiries" | "comments";

export interface AlertPrefs {
	inquiries: boolean;
	comments: boolean;
}

/** Hourly cap on inquiry alert rounds (one round = one submission). */
export const INQUIRY_ALERTS_PER_HOUR = 30;
const MAX_RECIPIENTS = 50;

/** Story-type categories get "story" wording; the rest are contact messages. */
const STORY_CATEGORIES = new Set(["news_tip", "founder_story"]);
const CATEGORY_LABELS: Record<string, string> = {
	general: "عام",
	news_tip: "خبر",
	founder_story: "قصة مؤسّس",
	event: "فعالية / ندوة",
	media_partnership: "شراكة إعلامية",
	correction: "تصحيح",
};

export async function getAlertPrefs(db: SqlDb, userId: string): Promise<AlertPrefs> {
	const row = await db
		.prepare(`SELECT inquiries, comments FROM as_alert_prefs WHERE user_id = ?`)
		.bind(userId)
		.first<{ inquiries: number; comments: number }>();
	// Inquiry alerts are on until the person turns them off; comment alerts are opt-in.
	return { inquiries: row ? Number(row.inquiries) === 1 : true, comments: Number(row?.comments ?? 0) === 1 };
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

export interface AlertRecipient {
	email: string;
	role: number;
}

/**
 * Inquiries: active Contributors and up, unless they turned alerts off.
 * Comments: active, opted-in Editors/Admins.
 * With nobody to alert, the configured editorial address is used.
 */
export async function alertRecipientList(db: SqlDb, kind: AlertKind, fallback: string): Promise<AlertRecipient[]> {
	const { results } =
		kind === "inquiries"
			? await db
					.prepare(
						`SELECT u.email AS email, u.role AS role FROM users u
						 LEFT JOIN as_alert_prefs p ON p.user_id = u.id
						 WHERE u.disabled = 0 AND u.role >= ? AND COALESCE(p.inquiries, 1) = 1
						 ORDER BY u.role DESC, u.email`,
					)
					.bind(ROLE.CONTRIBUTOR)
					.all<{ email: string; role: number }>()
			: await db
					.prepare(
						`SELECT u.email AS email, u.role AS role FROM as_alert_prefs p JOIN users u ON u.id = p.user_id
						 WHERE p.comments = 1 AND u.disabled = 0 AND u.role >= ?
						 ORDER BY u.role DESC, u.email`,
					)
					.bind(ROLE.EDITOR)
					.all<{ email: string; role: number }>();
	const seen = new Set<string>();
	const list: AlertRecipient[] = [];
	for (const row of results) {
		const email = String(row.email ?? "").trim();
		if (!email || seen.has(email.toLowerCase())) continue;
		seen.add(email.toLowerCase());
		list.push({ email, role: Number(row.role) });
	}
	if (list.length === 0 && fallback) list.push({ email: fallback, role: ROLE.ADMIN });
	return list.slice(0, MAX_RECIPIENTS);
}

/** Email addresses only (kept for callers and tests that need just the list). */
export async function alertRecipients(db: SqlDb, kind: AlertKind, fallback: string): Promise<string[]> {
	return (await alertRecipientList(db, kind, fallback)).map((recipient) => recipient.email);
}

type AlertMessage = { subject: string; text: string; html: string };

function inquiryAlert(category: string | undefined, origin: string, canOpenInbox: boolean): AlertMessage {
	const isStory = !!category && STORY_CATEGORIES.has(category);
	const label = (category && CATEGORY_LABELS[category]) || "عام";
	const subject = isStory ? "قصة أو خبر جديد في صندوق Arabs Startups" : "رسالة تواصل جديدة في صندوق Arabs Startups";
	const intro = isStory ? "وصلت قصة أو خبر جديد عبر الموقع." : "وصلت رسالة جديدة عبر نموذج التواصل.";
	const privacy = "لا يتضمّن هذا التنبيه نصّ الرسالة أو بيانات المرسل لحماية خصوصيته.";
	const stop = canOpenInbox ? "يمكنك إيقاف هذه التنبيهات من صفحة غرفة الأخبار." : "لإيقاف هذه التنبيهات اطلب ذلك من مدير الموقع.";
	const inbox = `${origin}/newsroom/inbox`;
	const text = [
		intro,
		`النوع: ${label}`,
		"",
		canOpenInbox ? `افتح صندوق الرسائل: ${inbox}` : "يتولّى المحرّرون مراجعتها في صندوق الرسائل.",
		"",
		privacy,
		stop,
	].join("\n");
	const html = renderEmailHtml({
		locale: "ar",
		origin,
		preheader: `${intro} النوع: ${label}`,
		eyebrow: "تنبيه للفريق",
		heading: isStory ? "قصة أو خبر جديد" : "رسالة تواصل جديدة",
		blocks: [
			{ kind: "text", text: intro },
			...(canOpenInbox ? [] : [{ kind: "muted" as const, text: "يتولّى المحرّرون مراجعتها في صندوق الرسائل." }]),
		],
		facts: [{ label: "النوع", value: label }],
		...(canOpenInbox ? { button: { label: "افتح صندوق الرسائل", href: inbox } } : {}),
		footnote: `${privacy}\n${stop}`,
	});
	return { subject, text, html };
}

function commentAlert(origin: string): AlertMessage {
	const link = `${origin}/newsroom/comments`;
	const privacy = "لا يتضمّن هذا التنبيه نصّ الرسالة لحماية خصوصية المرسل.";
	const stop = "يمكنك إيقاف التنبيهات من صفحة غرفة الأخبار.";
	return {
		subject: "تعليق جديد بانتظار المراجعة — Arabs Startups",
		text: ["وصل تعليق جديد بانتظار المراجعة.", "", `افتح غرفة الأخبار: ${link}`, "", privacy, stop].join("\n"),
		html: renderEmailHtml({
			locale: "ar",
			origin,
			preheader: "وصل تعليق جديد بانتظار المراجعة.",
			eyebrow: "تنبيه للفريق",
			heading: "تعليق جديد بانتظار المراجعة",
			blocks: [{ kind: "text", text: "وصل تعليق جديد على أحد المقالات، وهو بانتظار المراجعة قبل النشر." }],
			button: { label: "راجع التعليقات", href: link },
			footnote: `${privacy}\n${stop}`,
		}),
	};
}

export async function sendStaffAlert(
	db: SqlDb,
	mail: MailSettings,
	options: { kind: AlertKind; origin: string; fallback: string; category?: string },
): Promise<number> {
	const throttle = await checkRateLimits(db, [
		options.kind === "inquiries"
			? { bucket: "alert:inquiries", key: "all", limit: INQUIRY_ALERTS_PER_HOUR, windowSeconds: 3600 }
			: { bucket: "alert:comments", key: "all", limit: 1, windowSeconds: 900 },
	]);
	if (!throttle.allowed) return 0;
	const recipients = await alertRecipientList(db, options.kind, options.fallback);
	const results = await Promise.all(
		recipients.map((recipient) => {
			const message =
				options.kind === "inquiries"
					? inquiryAlert(options.category, options.origin, recipient.role >= ROLE.EDITOR)
					: commentAlert(options.origin);
			return sendEmail(db, mail, { to: recipient.email, ...message });
		}),
	);
	return results.filter((result) => result.ok).length;
}
