/** Server-side generated secrets kept in our own settings table. */
import { randomToken } from "../security/hash";
import type { SqlDb } from "./sql";

const cache = new Map<string, string>();

/** A random salt, generated once and persisted, for hashing IPs and emails. */
export async function getHashSalt(db: SqlDb): Promise<string> {
	const cached = cache.get("hash_salt");
	if (cached) return cached;
	await db
		.prepare(`INSERT OR IGNORE INTO as_settings (name, value) VALUES ('hash_salt', ?)`)
		.bind(randomToken(32))
		.run();
	const row = await db
		.prepare(`SELECT value FROM as_settings WHERE name = 'hash_salt'`)
		.first<{ value: string }>();
	if (!row?.value) throw new Error("hash salt unavailable");
	cache.set("hash_salt", row.value);
	return row.value;
}
