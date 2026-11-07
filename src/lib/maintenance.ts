/** Scheduled housekeeping (Cron Trigger, every minute; tasks self-throttle). */
import { writeAudit } from "./audit/log";
import { syncRoster } from "./audit/roster";
import { readConfig } from "./config";
import { ensureSchema } from "./db/migrations";
import type { SqlDb } from "./db/sql";
import { purgeExpired } from "./inbox/repo";
import { purgeOldRateWindows } from "./security/rate-limit";

export async function runMaintenance(db: SqlDb, now: Date): Promise<void> {
	try {
		await ensureSchema(db);
		const minute = now.getUTCMinutes();
		if (minute % 5 === 0) await syncRoster(db, now);
		if (minute === 17) {
			await purgeOldRateWindows(db, now.getTime());
			const removed = await purgeExpired(db, now);
			if (removed > 0) {
				const config = readConfig(typeof process !== "undefined" ? process.env : {});
				await writeAudit(db, {
					action: "inquiry.purge",
					targetType: "inquiry",
					detail: { count: removed, retentionDays: config.inquiryRetentionDays },
				});
			}
		}
	} catch (error) {
		console.error("[maintenance] failed:", error instanceof Error ? error.message : error);
	}
}
