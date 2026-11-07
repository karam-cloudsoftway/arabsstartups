/**
 * POST /api/comments — the ONLY public way to submit a comment.
 *
 * Order of checks (all server-side; bypassing the browser bypasses nothing):
 * same-origin → size cap → strict schema → honeypot → Turnstile (Siteverify)
 * → per-IP and per-email rate limits → published, open article → valid parent
 * → duplicate check → stored as PENDING (never auto-published).
 */
import type { APIRoute } from "astro";
import { CommentRepository } from "emdash";
import { commentSchema } from "../../lib/comments/policy";
import { submitVisitorComment, type CommentRefusal } from "../../lib/comments/service";
import { getConfig } from "../../lib/config";
import { getHashSalt } from "../../lib/db/settings";
import { sendStaffAlert } from "../../lib/email/alerts";
import { issuesToFields } from "../../lib/inbox/validation";
import { hashIdentifier } from "../../lib/security/hash";
import { isSameOriginRequest, readJsonBody } from "../../lib/security/origin";
import { checkRateLimits } from "../../lib/security/rate-limit";
import { verifyTurnstile } from "../../lib/security/turnstile";
import { clientIp, emdashDb, getDb, json, mailSettings } from "../../lib/runtime";

export const prerender = false;

const REFUSAL_STATUS: Record<CommentRefusal, number> = {
	comments_disabled: 403,
	comments_closed: 403,
	content_not_found: 404,
	parent_not_found: 400,
	duplicate: 409,
};

export const POST: APIRoute = async ({ request, url, locals }) => {
	if (!isSameOriginRequest(request, url.origin)) return json({ error: "forbidden" }, 403);

	const body = await readJsonBody(request, 8 * 1024);
	if (!body.ok) return json({ error: body.error }, body.status);

	const parsed = commentSchema.safeParse(body.value);
	if (!parsed.success) return json({ error: "validation", fields: issuesToFields(parsed.error) }, 400);
	const input = parsed.data;

	// Honeypot filled: answer like a normal success, store nothing.
	if (input.url) return json({ status: "pending" }, 201);

	const config = getConfig();
	const ip = clientIp(request);
	const captcha = await verifyTurnstile({
		token: input.turnstileToken,
		secret: config.turnstileSecret,
		expectedAction: "comment",
		allowedHostnames: config.turnstileAllowedHostnames,
		remoteIp: ip,
	});
	if (!captcha.ok) {
		console.warn(`[comments] turnstile rejected (${captcha.reason})`);
		return json({ error: "turnstile" }, 403);
	}

	const db = await getDb();
	const salt = await getHashSalt(db);
	const ipKey = ip ? await hashIdentifier("ip", ip, salt) : "unknown-ip";
	const emailKey = await hashIdentifier("email", input.authorEmail, salt);
	const limit = await checkRateLimits(db, [
		{ bucket: "comment:ip:10m", key: ipKey, limit: ip ? 5 : 30, windowSeconds: 600 },
		{ bucket: "comment:ip:1d", key: ipKey, limit: ip ? 30 : 300, windowSeconds: 86_400 },
		{ bucket: "comment:email:1h", key: emailKey, limit: 5, windowSeconds: 3600 },
	]);
	if (!limit.allowed) {
		return json({ error: "rate_limited" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
	}

	const cmsDb = emdashDb(locals);
	if (!cmsDb) return json({ error: "unavailable" }, 503);
	const repository = new CommentRepository(cmsDb);

	const result = await submitVisitorComment(
		db,
		async (record) => {
			const created = await repository.create(record);
			return { id: created.id, status: created.status };
		},
		{
			contentId: input.contentId,
			parentId: input.parentId ?? null,
			authorName: input.authorName,
			authorEmail: input.authorEmail,
			body: input.body,
			locale: input.locale,
		},
		{ ipHash: ip ? ipKey : null, userAgent: request.headers.get("User-Agent") },
	);
	if (!result.ok) return json({ error: result.reason }, REFUSAL_STATUS[result.reason]);

	try {
		await sendStaffAlert(db, mailSettings(), {
			kind: "comments",
			origin: url.origin,
			fallback: config.editorialAlertEmail,
		});
	} catch (error) {
		console.error("[comments] alert failed:", error instanceof Error ? error.message : error);
	}

	return json({ status: "pending" }, 201);
};

export const ALL: APIRoute = () => json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
