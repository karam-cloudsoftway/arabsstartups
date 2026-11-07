/**
 * Detective control for staff changes.
 *
 * Roles and accounts are changed in the EmDash admin (or by the CLI). This job
 * compares the live `users` table with our last snapshot and writes an audit
 * event for every addition, role change, disable/enable and removal — no
 * matter where the change was made. It runs from the cron trigger and when
 * the audit page loads.
 */
import { nowIso, type SqlDb } from "../db/sql";
import { writeAudit, type AuditAction } from "./log";

interface UserRow {
	id: string;
	email: string;
	role: number;
	disabled: number;
}

interface RosterRow {
	user_id: string;
	email: string;
	role: number;
	disabled: number;
}

export interface RosterChange {
	action: AuditAction;
	userId: string;
	email: string;
	detail: Record<string, string | number | boolean | null>;
}

export function diffRoster(previous: RosterRow[], current: UserRow[]): RosterChange[] {
	const before = new Map(previous.map((row) => [row.user_id, row]));
	const after = new Map(current.map((row) => [row.id, row]));
	const changes: RosterChange[] = [];

	for (const user of current) {
		const old = before.get(user.id);
		const role = Number(user.role);
		const disabled = Number(user.disabled) === 1;
		if (!old) {
			changes.push({
				action: "staff.added",
				userId: user.id,
				email: user.email,
				detail: { role, disabled },
			});
			continue;
		}
		if (Number(old.role) !== role) {
			changes.push({
				action: "staff.role_changed",
				userId: user.id,
				email: user.email,
				detail: { from: Number(old.role), to: role },
			});
		}
		const wasDisabled = Number(old.disabled) === 1;
		if (wasDisabled !== disabled) {
			changes.push({
				action: disabled ? "staff.disabled" : "staff.enabled",
				userId: user.id,
				email: user.email,
				detail: {},
			});
		}
	}

	for (const old of previous) {
		if (!after.has(old.user_id)) {
			changes.push({
				action: "staff.removed",
				userId: old.user_id,
				email: old.email,
				detail: { role: Number(old.role) },
			});
		}
	}
	return changes;
}

export async function syncRoster(db: SqlDb, now = new Date()): Promise<RosterChange[]> {
	const [{ results: current }, { results: previous }] = await Promise.all([
		db.prepare(`SELECT id, email, role, disabled FROM users`).all<UserRow>(),
		db.prepare(`SELECT user_id, email, role, disabled FROM as_staff_roster`).all<RosterRow>(),
	]);
	const changes = diffRoster(previous, current);
	if (changes.length === 0) return changes;

	for (const change of changes) {
		await writeAudit(
			db,
			{
				actorId: null,
				actorEmail: null,
				action: change.action,
				targetType: "user",
				targetId: change.userId,
				detail: { email: change.email, ...change.detail, detected: true },
			},
			now,
		);
	}

	const statements = [db.prepare(`DELETE FROM as_staff_roster`)];
	for (const user of current) {
		statements.push(
			db
				.prepare(
					`INSERT INTO as_staff_roster (user_id, email, role, disabled, seen_at) VALUES (?, ?, ?, ?, ?)`,
				)
				.bind(user.id, user.email, Number(user.role), Number(user.disabled), nowIso(now)),
		);
	}
	await db.batch(statements);
	return changes;
}
