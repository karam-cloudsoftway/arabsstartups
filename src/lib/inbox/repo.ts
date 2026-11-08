/** Contact inbox storage (own D1 tables, bound parameters only). */
import { newId, nowIso, type SqlDb } from "../db/sql";
import type { InquiryCategory, InquiryStatus } from "./validation";
import { INQUIRY_STATUSES } from "./validation";

export interface Inquiry {
	id: string;
	name: string;
	email: string;
	category: InquiryCategory;
	subject: string;
	message: string;
	organization: string | null;
	website: string | null;
	locale: string;
	status: InquiryStatus;
	is_read: number;
	assigned_editor_id: string | null;
	created_at: string;
	updated_at: string;
	responded_at: string | null;
	retention_due_at: string;
}

export interface InquiryNote {
	id: string;
	inquiry_id: string;
	kind: "note" | "reply";
	author_id: string;
	author_name: string | null;
	body: string;
	provider_message_id: string | null;
	created_at: string;
}

export interface NewInquiry {
	name: string;
	email: string;
	category: InquiryCategory;
	subject: string;
	message: string;
	organization: string;
	website: string;
	locale: string;
	ipHash: string | null;
	contentHash: string;
}

const LIST_COLUMNS = `id, name, email, category, subject, organization, status, is_read,
	assigned_editor_id, created_at, updated_at, responded_at`;

export async function createInquiry(
	db: SqlDb,
	input: NewInquiry,
	options: { now?: Date; retentionDays: number },
): Promise<string> {
	const now = options.now ?? new Date();
	const retention = new Date(now.getTime() + options.retentionDays * 86_400_000);
	const id = newId();
	await db
		.prepare(
			`INSERT INTO as_inquiries (id, name, email, category, subject, message, organization, website,
				locale, status, is_read, assigned_editor_id, ip_hash, content_hash, created_at, updated_at,
				responded_at, retention_due_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 0, NULL, ?, ?, ?, ?, NULL, ?)`,
		)
		.bind(
			id,
			input.name,
			input.email,
			input.category,
			input.subject,
			input.message,
			input.organization || null,
			input.website || null,
			input.locale,
			input.ipHash,
			input.contentHash,
			nowIso(now),
			nowIso(now),
			nowIso(retention),
		)
		.run();
	return id;
}

/** Same sender + same content in the last 24 hours (idempotent resubmits). */
export async function findRecentDuplicate(
	db: SqlDb,
	email: string,
	contentHash: string,
	now = new Date(),
): Promise<string | null> {
	const since = nowIso(new Date(now.getTime() - 86_400_000));
	const row = await db
		.prepare(
			`SELECT id FROM as_inquiries WHERE email = ? AND content_hash = ? AND created_at > ? LIMIT 1`,
		)
		.bind(email, contentHash, since)
		.first<{ id: string }>();
	return row?.id ?? null;
}

export interface InquiryFilter {
	statuses?: InquiryStatus[];
	category?: InquiryCategory | "";
	q?: string;
	limit?: number;
	offset?: number;
}

function whereClause(filter: InquiryFilter): { sql: string; params: unknown[] } {
	const parts: string[] = [];
	const params: unknown[] = [];
	const statuses = (filter.statuses ?? []).filter((s) => INQUIRY_STATUSES.includes(s));
	if (statuses.length > 0) {
		parts.push(`status IN (${statuses.map(() => "?").join(", ")})`);
		params.push(...statuses);
	}
	if (filter.category) {
		parts.push(`category = ?`);
		params.push(filter.category);
	}
	const q = (filter.q ?? "").trim().slice(0, 100);
	if (q) {
		const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
		parts.push(`(subject LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')`);
		params.push(like, like, like);
	}
	return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export async function listInquiries(
	db: SqlDb,
	filter: InquiryFilter,
): Promise<{ items: Omit<Inquiry, "message" | "website" | "locale" | "retention_due_at">[]; total: number }> {
	const { sql, params } = whereClause(filter);
	const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
	const offset = Math.max(filter.offset ?? 0, 0);
	// whereClause() returns fixed SQL fragments with ? placeholders; every value is in `params`.
	const [rows, count] = await Promise.all([
		db
			// eslint-disable-next-line no-restricted-syntax -- fixed fragments only, values bound
			.prepare(`SELECT ${LIST_COLUMNS} FROM as_inquiries ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
			.bind(...params, limit, offset)
			.all<Inquiry>(),
		db
			// eslint-disable-next-line no-restricted-syntax -- fixed fragments only, values bound
			.prepare(`SELECT COUNT(*) AS total FROM as_inquiries ${sql}`)
			.bind(...params)
			.first<{ total: number }>(),
	]);
	return { items: rows.results, total: Number(count?.total ?? 0) };
}

export async function exportInquiries(db: SqlDb, filter: InquiryFilter): Promise<Inquiry[]> {
	const { sql, params } = whereClause(filter);
	const { results } = await db
		// eslint-disable-next-line no-restricted-syntax -- fixed fragments only, values bound
		.prepare(`SELECT * FROM as_inquiries ${sql} ORDER BY created_at DESC LIMIT 5000`)
		.bind(...params)
		.all<Inquiry>();
	return results;
}

export async function getInquiry(db: SqlDb, id: string): Promise<Inquiry | null> {
	return db.prepare(`SELECT * FROM as_inquiries WHERE id = ?`).bind(id).first<Inquiry>();
}

export async function listNotes(db: SqlDb, inquiryId: string): Promise<InquiryNote[]> {
	const { results } = await db
		.prepare(`SELECT * FROM as_inquiry_notes WHERE inquiry_id = ? ORDER BY created_at ASC`)
		.bind(inquiryId)
		.all<InquiryNote>();
	return results;
}

export async function markRead(db: SqlDb, id: string): Promise<void> {
	await db.prepare(`UPDATE as_inquiries SET is_read = 1 WHERE id = ? AND is_read = 0`).bind(id).run();
}

export async function setStatus(db: SqlDb, id: string, status: InquiryStatus, now = new Date()): Promise<boolean> {
	const result = await db
		.prepare(`UPDATE as_inquiries SET status = ?, updated_at = ? WHERE id = ?`)
		.bind(status, nowIso(now), id)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export async function assign(db: SqlDb, id: string, editorId: string | null, now = new Date()): Promise<boolean> {
	const result = await db
		.prepare(`UPDATE as_inquiries SET assigned_editor_id = ?, updated_at = ? WHERE id = ?`)
		.bind(editorId, nowIso(now), id)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export async function addNote(
	db: SqlDb,
	note: { inquiryId: string; kind: "note" | "reply"; authorId: string; authorName: string | null; body: string; providerMessageId?: string | null },
	now = new Date(),
): Promise<string> {
	const id = newId();
	const statements = [
		db
			.prepare(
				`INSERT INTO as_inquiry_notes (id, inquiry_id, kind, author_id, author_name, body, provider_message_id, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(id, note.inquiryId, note.kind, note.authorId, note.authorName, note.body, note.providerMessageId ?? null, nowIso(now)),
	];
	if (note.kind === "reply") {
		statements.push(
			db
				.prepare(
					`UPDATE as_inquiries SET status = 'responded', responded_at = ?, updated_at = ? WHERE id = ?`,
				)
				.bind(nowIso(now), nowIso(now), note.inquiryId),
		);
	} else {
		statements.push(
			db.prepare(`UPDATE as_inquiries SET updated_at = ? WHERE id = ?`).bind(nowIso(now), note.inquiryId),
		);
	}
	await db.batch(statements);
	return id;
}

export async function deleteInquiry(db: SqlDb, id: string): Promise<boolean> {
	await db.prepare(`DELETE FROM as_inquiry_notes WHERE inquiry_id = ?`).bind(id).run();
	const result = await db.prepare(`DELETE FROM as_inquiries WHERE id = ?`).bind(id).run();
	return (result.meta.changes ?? 0) > 0;
}

export async function countByStatus(db: SqlDb): Promise<Record<InquiryStatus, number> & { unread: number }> {
	const { results } = await db
		.prepare(`SELECT status, COUNT(*) AS n FROM as_inquiries GROUP BY status`)
		.all<{ status: InquiryStatus; n: number }>();
	const unread = await db
		.prepare(`SELECT COUNT(*) AS n FROM as_inquiries WHERE is_read = 0 AND status != 'spam'`)
		.first<{ n: number }>();
	const counts = { new: 0, in_progress: 0, responded: 0, closed: 0, spam: 0, unread: Number(unread?.n ?? 0) };
	for (const row of results) counts[row.status] = Number(row.n);
	return counts;
}

/** Retention: delete messages (and their notes) past their retention date. */
export async function purgeExpired(db: SqlDb, now = new Date()): Promise<number> {
	const cutoff = nowIso(now);
	await db
		.prepare(
			`DELETE FROM as_inquiry_notes WHERE inquiry_id IN (SELECT id FROM as_inquiries WHERE retention_due_at < ?)`,
		)
		.bind(cutoff)
		.run();
	const result = await db.prepare(`DELETE FROM as_inquiries WHERE retention_due_at < ?`).bind(cutoff).run();
	return result.meta.changes ?? 0;
}
