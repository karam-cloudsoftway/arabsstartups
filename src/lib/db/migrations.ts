/**
 * Schema for Arabs Startups' own tables (EmDash manages its own tables).
 *
 * Rules: migrations are append-only. Never edit a shipped migration — add a
 * new one with the next version number. Every table is prefixed `as_`.
 */
import type { SqlDb } from "./sql";

export interface Migration {
	version: number;
	name: string;
	statements: string[];
}

export const MIGRATIONS: Migration[] = [
	{
		version: 1,
		name: "inbox, audit, rate limits, roster, settings",
		statements: [
			`CREATE TABLE IF NOT EXISTS as_settings (
				name TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS as_inquiries (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL,
				category TEXT NOT NULL,
				subject TEXT NOT NULL,
				message TEXT NOT NULL,
				organization TEXT,
				website TEXT,
				locale TEXT NOT NULL DEFAULT 'ar',
				status TEXT NOT NULL DEFAULT 'new'
					CHECK (status IN ('new','in_progress','responded','closed','spam')),
				is_read INTEGER NOT NULL DEFAULT 0,
				assigned_editor_id TEXT,
				ip_hash TEXT,
				content_hash TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				responded_at TEXT,
				retention_due_at TEXT NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS idx_as_inquiries_status ON as_inquiries (status, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_as_inquiries_email ON as_inquiries (email, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_as_inquiries_retention ON as_inquiries (retention_due_at)`,
			`CREATE TABLE IF NOT EXISTS as_inquiry_notes (
				id TEXT PRIMARY KEY,
				inquiry_id TEXT NOT NULL REFERENCES as_inquiries (id) ON DELETE CASCADE,
				kind TEXT NOT NULL CHECK (kind IN ('note','reply')),
				author_id TEXT NOT NULL,
				author_name TEXT,
				body TEXT NOT NULL,
				provider_message_id TEXT,
				created_at TEXT NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS idx_as_inquiry_notes_inquiry ON as_inquiry_notes (inquiry_id, created_at)`,
			`CREATE TABLE IF NOT EXISTS as_audit_log (
				id TEXT PRIMARY KEY,
				at TEXT NOT NULL,
				actor_id TEXT,
				actor_email TEXT,
				action TEXT NOT NULL,
				target_type TEXT,
				target_id TEXT,
				detail TEXT
			)`,
			`CREATE INDEX IF NOT EXISTS idx_as_audit_at ON as_audit_log (at)`,
			`CREATE INDEX IF NOT EXISTS idx_as_audit_action ON as_audit_log (action, at)`,
			`CREATE TABLE IF NOT EXISTS as_rate_limits (
				bucket TEXT NOT NULL,
				key TEXT NOT NULL,
				window_start INTEGER NOT NULL,
				count INTEGER NOT NULL,
				PRIMARY KEY (bucket, key, window_start)
			)`,
			`CREATE TABLE IF NOT EXISTS as_staff_roster (
				user_id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				role INTEGER NOT NULL,
				disabled INTEGER NOT NULL,
				seen_at TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS as_alert_prefs (
				user_id TEXT PRIMARY KEY,
				inquiries INTEGER NOT NULL DEFAULT 0,
				comments INTEGER NOT NULL DEFAULT 0,
				updated_at TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS as_dev_outbox (
				id TEXT PRIMARY KEY,
				to_addr TEXT NOT NULL,
				subject TEXT NOT NULL,
				body TEXT NOT NULL,
				created_at TEXT NOT NULL
			)`,
		],
	},
];

const ensured = new WeakMap<object, Promise<void>>();

/** Apply pending migrations once per isolate and database handle. */
export function ensureSchema(db: SqlDb): Promise<void> {
	const existing = ensured.get(db);
	if (existing) return existing;
	const pending = applyMigrations(db).then(
		() => undefined,
		(error: unknown) => {
			ensured.delete(db);
			throw error;
		},
	);
	ensured.set(db, pending);
	return pending;
}

export async function applyMigrations(db: SqlDb): Promise<number[]> {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS as_schema_migrations (
				version INTEGER PRIMARY KEY,
				name TEXT NOT NULL,
				applied_at TEXT NOT NULL
			)`,
		)
		.run();
	const { results } = await db
		.prepare(`SELECT version FROM as_schema_migrations`)
		.all<{ version: number }>();
	const done = new Set(results.map((row) => Number(row.version)));
	const applied: number[] = [];
	for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
		if (done.has(migration.version)) continue;
		const statements = migration.statements.map((sql) => db.prepare(sql));
		statements.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO as_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
				)
				.bind(migration.version, migration.name, new Date().toISOString()),
		);
		await db.batch(statements);
		applied.push(migration.version);
	}
	return applied;
}
