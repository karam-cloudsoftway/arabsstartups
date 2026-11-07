/**
 * DEVELOPMENT ONLY — sign in as a test staff member of a given role.
 *   /dev/login?role=editor&next=/newsroom
 * `import.meta.env.DEV` is a build-time constant: in production builds this
 * handler is dead code, and the outer middleware answers 404 for /dev/* too.
 */
import type { APIRoute } from "astro";
import { getDb } from "../../lib/runtime";

export const prerender = false;

const ROLES: Record<string, number> = { subscriber: 10, contributor: 20, author: 30, editor: 40, admin: 50 };
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulid(): string {
	let time = Date.now();
	let out = "";
	for (let i = 0; i < 10; i++) {
		out = CROCKFORD[time % 32] + out;
		time = Math.floor(time / 32);
	}
	const random = crypto.getRandomValues(new Uint8Array(16));
	for (const byte of random) out += CROCKFORD[byte % 32];
	return out;
}

export const GET: APIRoute = async ({ url, session, redirect }) => {
	if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });

	const roleName = url.searchParams.get("role") ?? "admin";
	const role = ROLES[roleName];
	if (!role) return new Response("unknown role", { status: 400 });
	const disabled = url.searchParams.get("disabled") === "1" ? 1 : 0;
	const label = (url.searchParams.get("as") ?? roleName).replace(/[^a-z0-9-]/gi, "").slice(0, 30) || roleName;
	const email = `${label}@dev.arabsstartups.test`;
	const next = url.searchParams.get("next") ?? "/newsroom";
	const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/newsroom";

	const db = await getDb();
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO users (id, email, name, role, email_verified, disabled, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 1, ?, ?, ?)
			 ON CONFLICT (email) DO UPDATE SET role = excluded.role, disabled = excluded.disabled, updated_at = excluded.updated_at`,
		)
		.bind(ulid(), email, `Dev ${label}`, role, disabled, now, now)
		.run();
	const user = await db.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>();
	if (!user) return new Response("could not create user", { status: 500 });
	session?.set("user", { id: user.id });
	return redirect(safeNext, 303);
};
