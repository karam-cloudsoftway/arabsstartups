/**
 * Worker entry point. EmDash serves every request; the Cron Trigger runs
 * EmDash scheduled publishing/maintenance and then our own housekeeping
 * (staff-change audit, rate-limit cleanup, contact-message retention).
 */
import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { runMaintenance } from "./lib/maintenance";
import type { SqlDb } from "./lib/db/sql";

export { PluginBridge };

const emdashScheduled = createScheduledHandler();

export default {
	...handler,
	async scheduled(controller, env, ctx) {
		await emdashScheduled(controller, env, ctx);
		const db = (env as { DB?: unknown }).DB as SqlDb | undefined;
		if (db) ctx.waitUntil(runMaintenance(db, new Date(controller.scheduledTime)));
	},
} satisfies ExportedHandler;
