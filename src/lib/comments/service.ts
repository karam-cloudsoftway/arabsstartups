/**
 * Comment rules that sit in front of EmDash's comment storage.
 *
 * Visitor comments ALWAYS start as `pending` — whatever the collection's
 * moderation setting — and only approved comments are ever shown.
 * Staff replies are created as approved, linked to the staff account and to
 * the parent thread, and audited.
 */
import type { SqlDb } from "../db/sql";
import { STAFF_TEAM_NAME } from "./policy";

export const COMMENT_COLLECTION = "posts";

export interface CreateCommentRecord {
	collection: string;
	contentId: string;
	parentId: string | null;
	authorName: string;
	authorEmail: string;
	authorUserId: string | null;
	body: string;
	status: "pending" | "approved";
	ipHash: string | null;
	userAgent: string | null;
	moderationMetadata: Record<string, unknown>;
}

/** Implemented with EmDash's CommentRepository in production code. */
export type CommentWriter = (record: CreateCommentRecord) => Promise<{ id: string; status: string }>;

export type CommentRefusal =
	| "comments_disabled"
	| "comments_closed"
	| "content_not_found"
	| "parent_not_found"
	| "duplicate";

interface CollectionRow {
	comments_enabled: number;
	comments_closed_after_days: number;
}

interface ContentRow {
	id: string;
	published_at: string | null;
}

interface CommentRow {
	id: string;
	collection: string;
	content_id: string;
	parent_id: string | null;
	status: string;
}

export async function checkCommentable(
	db: SqlDb,
	contentId: string,
	now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: CommentRefusal }> {
	const settings = await db
		.prepare(
			`SELECT comments_enabled, comments_closed_after_days FROM _emdash_collections WHERE slug = ?`,
		)
		.bind(COMMENT_COLLECTION)
		.first<CollectionRow>();
	if (!settings || Number(settings.comments_enabled) !== 1) {
		return { ok: false, reason: "comments_disabled" };
	}
	const content = await db
		.prepare(
			// eslint-disable-next-line no-restricted-syntax -- table name is a constant; contentId is bound below
			`SELECT id, published_at FROM ec_${COMMENT_COLLECTION}
			 WHERE id = ? AND status = 'published' AND deleted_at IS NULL`,
		)
		.bind(contentId)
		.first<ContentRow>();
	if (!content) return { ok: false, reason: "content_not_found" };

	const closeAfter = Number(settings.comments_closed_after_days);
	if (closeAfter > 0 && content.published_at) {
		const closes = new Date(content.published_at).getTime() + closeAfter * 86_400_000;
		if (now.getTime() > closes) return { ok: false, reason: "comments_closed" };
	}
	return { ok: true };
}

/** Threads are one level deep: a reply to a reply attaches to the top comment. */
export async function resolveParent(
	db: SqlDb,
	contentId: string,
	parentId: string | null | undefined,
	options: { requireApproved: boolean },
): Promise<{ ok: true; parentId: string | null; parent: CommentRow | null } | { ok: false; reason: CommentRefusal }> {
	if (!parentId) return { ok: true, parentId: null, parent: null };
	const parent = await db
		.prepare(
			`SELECT id, collection, content_id, parent_id, status FROM _emdash_comments WHERE id = ?`,
		)
		.bind(parentId)
		.first<CommentRow>();
	if (
		!parent ||
		parent.collection !== COMMENT_COLLECTION ||
		parent.content_id !== contentId ||
		(options.requireApproved && parent.status !== "approved")
	) {
		return { ok: false, reason: "parent_not_found" };
	}
	return { ok: true, parentId: parent.parent_id ?? parent.id, parent };
}

export async function isDuplicateComment(
	db: SqlDb,
	input: { contentId: string; authorEmail: string; body: string },
	now = new Date(),
): Promise<boolean> {
	const since = new Date(now.getTime() - 86_400_000).toISOString();
	const row = await db
		.prepare(
			`SELECT id FROM _emdash_comments
			 WHERE content_id = ? AND lower(author_email) = ? AND body = ? AND created_at > ? LIMIT 1`,
		)
		.bind(input.contentId, input.authorEmail, input.body, since)
		.first<{ id: string }>();
	return !!row;
}

export interface VisitorComment {
	contentId: string;
	parentId?: string | null;
	authorName: string;
	authorEmail: string;
	body: string;
	locale: string;
}

export async function submitVisitorComment(
	db: SqlDb,
	write: CommentWriter,
	input: VisitorComment,
	meta: { ipHash: string | null; userAgent: string | null; now?: Date },
): Promise<{ ok: true; id: string } | { ok: false; reason: CommentRefusal }> {
	const now = meta.now ?? new Date();
	const commentable = await checkCommentable(db, input.contentId, now);
	if (!commentable.ok) return commentable;

	const parent = await resolveParent(db, input.contentId, input.parentId, { requireApproved: true });
	if (!parent.ok) return parent;

	if (await isDuplicateComment(db, input, now)) return { ok: false, reason: "duplicate" };

	const created = await write({
		collection: COMMENT_COLLECTION,
		contentId: input.contentId,
		parentId: parent.parentId,
		authorName: input.authorName,
		authorEmail: input.authorEmail,
		authorUserId: null,
		body: input.body,
		status: "pending", // never auto-publish visitor comments
		ipHash: meta.ipHash,
		userAgent: meta.userAgent ? meta.userAgent.slice(0, 200) : null,
		moderationMetadata: { source: "as-gateway", locale: input.locale, turnstile: true },
	});
	return { ok: true, id: created.id };
}

export interface StaffReplyInput {
	commentId: string;
	body: string;
	identity: "team" | "self";
	staff: { id: string; email: string; name: string | null };
}

export async function createStaffReply(
	db: SqlDb,
	write: CommentWriter,
	input: StaffReplyInput,
): Promise<{ ok: true; id: string; contentId: string; parentId: string } | { ok: false; reason: CommentRefusal }> {
	const target = await db
		.prepare(
			`SELECT id, collection, content_id, parent_id, status FROM _emdash_comments WHERE id = ?`,
		)
		.bind(input.commentId)
		.first<CommentRow>();
	if (!target || target.collection !== COMMENT_COLLECTION || target.status !== "approved") {
		return { ok: false, reason: "parent_not_found" };
	}
	const parentId = target.parent_id ?? target.id;
	const authorName =
		input.identity === "self" && input.staff.name ? input.staff.name : STAFF_TEAM_NAME;
	const created = await write({
		collection: COMMENT_COLLECTION,
		contentId: target.content_id,
		parentId,
		authorName,
		authorEmail: input.staff.email,
		authorUserId: input.staff.id,
		body: input.body,
		status: "approved",
		ipHash: null,
		userAgent: null,
		moderationMetadata: { source: "as-newsroom", staffReply: true, identity: input.identity },
	});
	return { ok: true, id: created.id, contentId: target.content_id, parentId };
}
