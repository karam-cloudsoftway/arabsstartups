/**
 * THE access rule for the staff newsroom (/newsroom). Every newsroom page and
 * API route calls `authorizeStaff` — there is no second implementation.
 *
 * Production: identity comes ONLY from a Cloudflare Access JWT that the outer
 * middleware verified on this very request. The EmDash session is ignored,
 * so a person removed from Access loses the newsroom immediately.
 * Development (`astro dev`): identity comes from the local EmDash session.
 *
 * In both modes the EmDash user record is re-read on every request: a
 * disabled account or a lowered role takes effect on the next click.
 */
import type { AccessIdentity } from "../security/access-jwt";
import type { SqlDb } from "../db/sql";
import { can, type NewsroomPermission } from "./roles";

export interface StaffUser {
	id: string;
	email: string;
	name: string | null;
	role: number;
	disabled: boolean;
}

export type StaffDecision =
	| { ok: true; user: StaffUser; identity: AccessIdentity | null }
	| { ok: false; status: 401 | 403; reason: "no-identity" | "not-provisioned" | "disabled" | "forbidden" };

export interface StaffLookup {
	byId(id: string): Promise<StaffUser | null>;
	byEmail(email: string): Promise<StaffUser | null>;
}

export interface StaffRequestFacts {
	production: boolean;
	/** Set by the outer middleware after verifying the Access JWT (production only). */
	accessIdentity: AccessIdentity | null | undefined;
	/** EmDash session user (development only). */
	sessionUserId: string | null | undefined;
}

export async function authorizeStaff(
	facts: StaffRequestFacts,
	lookup: StaffLookup,
	permission: NewsroomPermission,
): Promise<StaffDecision> {
	let user: StaffUser | null;
	let identity: AccessIdentity | null = null;

	if (facts.production) {
		if (!facts.accessIdentity) return { ok: false, status: 401, reason: "no-identity" };
		identity = facts.accessIdentity;
		user = await lookup.byEmail(identity.email);
	} else {
		if (!facts.sessionUserId) return { ok: false, status: 401, reason: "no-identity" };
		user = await lookup.byId(facts.sessionUserId);
	}

	if (!user) return { ok: false, status: 403, reason: "not-provisioned" };
	if (user.disabled) return { ok: false, status: 403, reason: "disabled" };
	if (!can(user, permission)) return { ok: false, status: 403, reason: "forbidden" };
	return { ok: true, user, identity };
}

interface UserRow {
	id: string;
	email: string;
	name: string | null;
	role: number;
	disabled: number;
}

function toStaff(row: UserRow | null): StaffUser | null {
	if (!row) return null;
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		role: Number(row.role),
		disabled: Number(row.disabled) === 1,
	};
}

/** Reads EmDash's `users` table directly (read-only). */
export function sqlStaffLookup(db: SqlDb): StaffLookup {
	return {
		async byId(id) {
			return toStaff(
				await db
					.prepare(`SELECT id, email, name, role, disabled FROM users WHERE id = ?`)
					.bind(id)
					.first<UserRow>(),
			);
		},
		async byEmail(email) {
			return toStaff(
				await db
					.prepare(
						`SELECT id, email, name, role, disabled FROM users WHERE lower(email) = lower(?)`,
					)
					.bind(email)
					.first<UserRow>(),
			);
		},
	};
}

export async function listStaff(db: SqlDb, minRole = 20): Promise<StaffUser[]> {
	const { results } = await db
		.prepare(
			`SELECT id, email, name, role, disabled FROM users WHERE role >= ? ORDER BY role DESC, email`,
		)
		.bind(minRole)
		.all<UserRow>();
	return results.map((row) => toStaff(row) as StaffUser);
}
