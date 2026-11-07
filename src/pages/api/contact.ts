/**
 * POST /api/contact — public contact / news-submission form.
 * Same server-side gauntlet as comments, then stored PRIVATELY in the
 * newsroom inbox (visible to Editors/Admins only). Staff alerts carry a link,
 * never the message.
 */
import type { APIRoute } from "astro";
import { writeAudit } from "../../lib/audit/log";
import { getConfig } from "../../lib/config";
import { getHashSalt } from "../../lib/db/settings";
import { sendStaffAlert } from "../../lib/email/alerts";
import { createInquiry, findRecentDuplicate } from "../../lib/inbox/repo";
import { contactSchema, issuesToFields } from "../../lib/inbox/validation";
import { hashIdentifier, sha256Hex } from "../../lib/security/hash";
import { isSameOriginRequest, readJsonBody } from "../../lib/security/origin";
import { checkRateLimits } from "../../lib/security/rate-limit";
import { verifyTurnstile } from "../../lib/security/turnstile";
import { clientIp, getDb, json, mailSettings } from "../../lib/runtime";

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
	if (!isSameOriginRequest(request, url.origin)) return json({ error: "forbidden" }, 403);

	const body = await readJsonBody(request, 16 * 1024);
	if (!body.ok) return json({ error: body.error }, body.status);

	const parsed = contactSchema.safeParse(body.value);
	if (!parsed.success) return json({ error: "validation", fields: issuesToFields(parsed.error) }, 400);
	const input = parsed.data;

	if (input.url) return json({ status: "received" }, 201); // honeypot

	const config = getConfig();
	const ip = clientIp(request);
	const captcha = await verifyTurnstile({
		token: input.turnstileToken,
		secret: config.turnstileSecret,
		expectedAction: "contact",
		allowedHostnames: config.turnstileAllowedHostnames,
		remoteIp: ip,
	});
	if (!captcha.ok) {
		console.warn(`[contact] turnstile rejected (${captcha.reason})`);
		return json({ error: "turnstile" }, 403);
	}

	const db = await getDb();
	const salt = await getHashSalt(db);
	const ipKey = ip ? await hashIdentifier("ip", ip, salt) : "unknown-ip";
	const emailKey = await hashIdentifier("email", input.email, salt);
	const limit = await checkRateLimits(db, [
		{ bucket: "contact:ip:10m", key: ipKey, limit: ip ? 3 : 30, windowSeconds: 600 },
		{ bucket: "contact:ip:1d", key: ipKey, limit: ip ? 10 : 300, windowSeconds: 86_400 },
		{ bucket: "contact:email:1h", key: emailKey, limit: 3, windowSeconds: 3600 },
	]);
	if (!limit.allowed) {
		return json({ error: "rate_limited" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
	}

	const contentHash = await sha256Hex(`${input.subject}\n${input.message}`);
	// Idempotent: an identical resubmission within 24h is acknowledged, not stored twice.
	if (await findRecentDuplicate(db, input.email, contentHash)) return json({ status: "received" }, 201);

	const id = await createInquiry(
		db,
		{
			name: input.name,
			email: input.email,
			category: input.category,
			subject: input.subject,
			message: input.message,
			organization: input.organization,
			website: input.orgWebsite,
			locale: input.locale,
			ipHash: ip ? ipKey : null,
			contentHash,
		},
		{ retentionDays: config.inquiryRetentionDays },
	);
	await writeAudit(db, {
		action: "inquiry.received",
		targetType: "inquiry",
		targetId: id,
		detail: { category: input.category, locale: input.locale },
	});

	try {
		await sendStaffAlert(db, mailSettings(), {
			kind: "inquiries",
			origin: url.origin,
			fallback: config.editorialAlertEmail,
		});
	} catch (error) {
		console.error("[contact] alert failed:", error instanceof Error ? error.message : error);
	}

	return json({ status: "received" }, 201);
};

export const ALL: APIRoute = () => json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
