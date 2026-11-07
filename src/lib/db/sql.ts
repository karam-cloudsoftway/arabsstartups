/**
 * Minimal SQL interface used by our data layer.
 *
 * Cloudflare D1 satisfies it structurally, and the unit tests provide a
 * node:sqlite implementation, so every query here runs against real SQLite
 * in tests. All values are bound parameters — never string-concatenated.
 */
export interface SqlStatement {
	bind(...values: unknown[]): SqlStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	run(): Promise<{ meta: { changes?: number } }>;
}

export interface SqlDb {
	prepare(sql: string): SqlStatement;
	batch(statements: SqlStatement[]): Promise<unknown[]>;
}

export function nowIso(now: Date = new Date()): string {
	return now.toISOString();
}

export function newId(): string {
	return crypto.randomUUID();
}
