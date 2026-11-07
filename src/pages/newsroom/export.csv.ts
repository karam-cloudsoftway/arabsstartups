/**
 * GET /newsroom/export.csv — Admin only, recent sign-in required in production,
 * audited. CSV cells are protected against spreadsheet formula injection.
 */
import type { APIRoute } from "astro";
import { writeAudit } from "../../lib/audit/log";
import { toCsv } from "../../lib/inbox/csv";
import { exportInquiries } from "../../lib/inbox/repo";
import { INQUIRY_CATEGORIES, INQUIRY_STATUSES, type InquiryCategory, type InquiryStatus } from "../../lib/inbox/validation";
import { isFreshAuthentication } from "../../lib/security/access-jwt";
import { getDb, isProduction, requireStaff } from "../../lib/runtime";
import { denyResponse } from "../../lib/staff/deny";

export const prerender = false;

export const GET: APIRoute = async (context) => {
	const decision = await requireStaff(context, "inbox:export");
	if (!decision.ok) return denyResponse(decision);
	const { user, identity } = decision;

	if (isProduction && (!identity || !isFreshAuthentication(identity, Math.floor(Date.now() / 1000)))) {
		return context.redirect("/newsroom/inbox?err=fresh_auth", 303);
	}

	const params = context.url.searchParams;
	const statusParam = params.get("status") ?? "all";
	const statuses: InquiryStatus[] =
		statusParam === "open"
			? ["new", "in_progress"]
			: (INQUIRY_STATUSES as readonly string[]).includes(statusParam)
				? [statusParam as InquiryStatus]
				: [];
	const categoryParam = params.get("category") ?? "";
	const category = (INQUIRY_CATEGORIES as readonly string[]).includes(categoryParam)
		? (categoryParam as InquiryCategory)
		: "";
	const q = (params.get("q") ?? "").slice(0, 100);

	const db = await getDb();
	const rows = await exportInquiries(db, { statuses, category, q });
	await writeAudit(db, {
		actorId: user.id,
		actorEmail: user.email,
		action: "inquiry.export",
		targetType: "inquiry",
		detail: { count: rows.length, status: statusParam, category: category || null, q: q ? "yes" : "no" },
	});

	const csv = toCsv(rows as unknown as Record<string, unknown>[], [
		{ key: "id", header: "id" },
		{ key: "created_at", header: "created_at" },
		{ key: "status", header: "status" },
		{ key: "category", header: "category" },
		{ key: "name", header: "name" },
		{ key: "email", header: "email" },
		{ key: "organization", header: "organization" },
		{ key: "website", header: "website" },
		{ key: "subject", header: "subject" },
		{ key: "message", header: "message" },
		{ key: "responded_at", header: "responded_at" },
	]);
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="arabsstartups-inbox-${stamp}.csv"`,
			"Cache-Control": "private, no-store",
		},
	});
};
