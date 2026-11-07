/**
 * Public liveness check for uptime monitoring (no data, no secrets).
 * Reports whether the database answers; never exposes details.
 */
import type { APIRoute } from "astro";
import { getDb } from "../lib/runtime";

export const prerender = false;

export const GET: APIRoute = async () => {
	let database = "ok";
	try {
		const db = await getDb();
		await db.prepare("SELECT 1 AS ok").first();
	} catch {
		database = "error";
	}
	return new Response(JSON.stringify({ status: database === "ok" ? "ok" : "degraded", database }), {
		status: database === "ok" ? 200 : 503,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
};
