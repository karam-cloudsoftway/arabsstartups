/**
 * A tiny D1-compatible adapter over node:sqlite, so our data layer runs
 * against real SQLite in unit tests (same SQL, same bound parameters).
 */
import { DatabaseSync } from "node:sqlite";
import type { SqlDb, SqlStatement } from "../../../src/lib/db/sql";

type Bindable = string | number | bigint | null | Uint8Array;

function normalize(values: unknown[]): Bindable[] {
	return values.map((value) => {
		if (value === undefined) return null;
		if (typeof value === "boolean") return value ? 1 : 0;
		return value as Bindable;
	});
}

class Statement implements SqlStatement {
	constructor(
		private readonly db: DatabaseSync,
		private readonly sql: string,
		private readonly values: Bindable[] = [],
	) {}

	bind(...values: unknown[]): SqlStatement {
		return new Statement(this.db, this.sql, normalize(values));
	}

	async first<T>(): Promise<T | null> {
		const row = this.db.prepare(this.sql).get(...this.values);
		return (row as T | undefined) ?? null;
	}

	async all<T>(): Promise<{ results: T[] }> {
		return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
	}

	async run(): Promise<{ meta: { changes?: number } }> {
		const result = this.db.prepare(this.sql).run(...this.values);
		return { meta: { changes: Number(result.changes) } };
	}

	execute(): unknown {
		return this.db.prepare(this.sql).run(...this.values);
	}
}

export function createTestDb(): SqlDb & { raw: DatabaseSync } {
	const raw = new DatabaseSync(":memory:");
	raw.exec("PRAGMA foreign_keys = ON");
	return {
		raw,
		prepare(sql: string) {
			return new Statement(raw, sql);
		},
		async batch(statements: SqlStatement[]) {
			raw.exec("BEGIN");
			try {
				const results = statements.map((statement) => (statement as Statement).execute());
				raw.exec("COMMIT");
				return results;
			} catch (error) {
				raw.exec("ROLLBACK");
				throw error;
			}
		},
	};
}

/** Minimal copies of the EmDash core tables our code reads (users, comments, posts). */
export function createEmDashTables(db: { raw: DatabaseSync }): void {
	db.raw.exec(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, avatar_url TEXT,
			role INTEGER NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, data TEXT,
			disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT
		);
		CREATE TABLE _emdash_collections (
			slug TEXT PRIMARY KEY, comments_enabled INTEGER DEFAULT 0,
			comments_moderation TEXT DEFAULT 'first_time', comments_closed_after_days INTEGER DEFAULT 90,
			comments_auto_approve_users INTEGER DEFAULT 1
		);
		CREATE TABLE ec_posts (
			id TEXT PRIMARY KEY, slug TEXT, title TEXT, status TEXT, published_at TEXT, deleted_at TEXT
		);
		CREATE TABLE _emdash_comments (
			id TEXT PRIMARY KEY, collection TEXT NOT NULL, content_id TEXT NOT NULL, parent_id TEXT,
			author_name TEXT NOT NULL, author_email TEXT NOT NULL, author_url TEXT, author_user_id TEXT,
			body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', ip_hash TEXT, user_agent TEXT,
			moderation_metadata TEXT, created_at TEXT, updated_at TEXT
		);
	`);
}
