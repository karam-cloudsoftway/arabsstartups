/**
 * Request-time wiring: bindings, the database handle and request facts.
 * Kept separate from pure modules so those stay unit-testable in Node.
 */
import { env } from "cloudflare:workers";
import type { APIContext, AstroGlobal } from "astro";
import { getRequestContext } from "emdash";
import { getConfig } from "./config";
import { ensureSchema } from "./db/migrations";
import type { SqlDb } from "./db/sql";
import type { MailSettings } from "./email/send";
import { authorizeStaff, sqlStaffLookup, type StaffDecision } from "./staff/guard";
import type { NewsroomPermission } from "./staff/roles";

export const isProduction = !import.meta.env.DEV;

export async function getDb(): Promise<SqlDb> {
	const db = (env as unknown as { DB: SqlDb }).DB;
	if (!db) throw new Error("D1 binding DB is missing");
	await ensureSchema(db);
	return db;
}

type EmDashDb = NonNullable<NonNullable<App.Locals["emdash"]>["db"]>;

/**
 * EmDash's Kysely handle for this request. Signed-in requests get it on
 * `locals.emdash`; EmDash's anonymous fast path only sets it on the request
 * context, so fall back to that.
 */
export function emdashDb(locals: App.Locals): EmDashDb | null {
	const fromLocals = (locals as { emdash?: { db?: EmDashDb } }).emdash?.db;
	if (fromLocals) return fromLocals;
	return ((getRequestContext()?.db as EmDashDb | undefined) ?? null);
}

export function mailSettings(): MailSettings {
	const config = getConfig();
	return {
		resendApiKey: config.resendApiKey,
		mailFrom: config.mailFrom,
		devOutbox: !isProduction,
	};
}

/** Trusted client IP: only Cloudflare's own header (absent in local dev). */
export function clientIp(request: Request): string | null {
	return request.headers.get("CF-Connecting-IP");
}

type RequestScope = Pick<APIContext, "locals" | "request" | "url"> | Pick<AstroGlobal, "locals" | "request" | "url">;

export async function requireStaff(scope: RequestScope, permission: NewsroomPermission): Promise<StaffDecision> {
	const db = await getDb();
	const locals = scope.locals as App.Locals & { user?: { id?: string } | null };
	return authorizeStaff(
		{
			production: isProduction,
			accessIdentity: locals.accessIdentity,
			sessionUserId: locals.user?.id ?? null,
		},
		sqlStaffLookup(db),
		permission,
	);
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
	});
}
