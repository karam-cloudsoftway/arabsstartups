/**
 * Audit trail for privileged actions. Records WHO did WHAT to WHICH record.
 * Never store OTPs, secrets, tokens or full message bodies in `detail`.
 */
import { newId, nowIso, type SqlDb } from "../db/sql";

export type AuditAction =
	| "inquiry.received"
	| "inquiry.status"
	| "inquiry.assign"
	| "inquiry.note"
	| "inquiry.reply"
	| "inquiry.delete"
	| "inquiry.export"
	| "inquiry.purge"
	| "comment.reply"
	| "comment.moderate"
	| "staff.added"
	| "staff.role_changed"
	| "staff.disabled"
	| "staff.enabled"
	| "staff.removed"
	| "staff.denied"
	| "alerts.updated";

export interface AuditEntry {
	actorId?: string | null;
	actorEmail?: string | null;
	action: AuditAction;
	targetType?: string | null;
	targetId?: string | null;
	detail?: Record<string, string | number | boolean | null>;
}

export async function writeAudit(db: SqlDb, entry: AuditEntry, now = new Date()): Promise<void> {
	await db
		.prepare(
			`INSERT INTO as_audit_log (id, at, actor_id, actor_email, action, target_type, target_id, detail)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			newId(),
			nowIso(now),
			entry.actorId ?? null,
			entry.actorEmail ?? null,
			entry.action,
			entry.targetType ?? null,
			entry.targetId ?? null,
			entry.detail ? JSON.stringify(entry.detail) : null,
		)
		.run();
}

export interface AuditRow {
	id: string;
	at: string;
	actor_id: string | null;
	actor_email: string | null;
	action: string;
	target_type: string | null;
	target_id: string | null;
	detail: string | null;
}

export async function listAudit(
	db: SqlDb,
	options: { limit?: number; offset?: number; action?: string } = {},
): Promise<AuditRow[]> {
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
	const offset = Math.max(options.offset ?? 0, 0);
	if (options.action) {
		const { results } = await db
			.prepare(`SELECT * FROM as_audit_log WHERE action = ? ORDER BY at DESC LIMIT ? OFFSET ?`)
			.bind(options.action, limit, offset)
			.all<AuditRow>();
		return results;
	}
	const { results } = await db
		.prepare(`SELECT * FROM as_audit_log ORDER BY at DESC LIMIT ? OFFSET ?`)
		.bind(limit, offset)
		.all<AuditRow>();
	return results;
}
