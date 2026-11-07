/**
 * Fixed-window rate limiter stored in D1 (survives isolate restarts and is
 * shared by every Worker instance). Keys are hashed identifiers, never raw IPs
 * or emails.
 */
import type { SqlDb } from "../db/sql";

export interface RateRule {
	bucket: string;
	key: string;
	limit: number;
	windowSeconds: number;
}

export interface RateDecision {
	allowed: boolean;
	retryAfterSeconds: number;
	bucket: string;
}

export async function hitRateLimit(
	db: SqlDb,
	rule: RateRule,
	nowMs: number = Date.now(),
): Promise<RateDecision> {
	const nowSeconds = Math.floor(nowMs / 1000);
	const windowStart = Math.floor(nowSeconds / rule.windowSeconds) * rule.windowSeconds;
	const row = await db
		.prepare(
			`INSERT INTO as_rate_limits (bucket, key, window_start, count) VALUES (?, ?, ?, 1)
			 ON CONFLICT (bucket, key, window_start) DO UPDATE SET count = count + 1
			 RETURNING count`,
		)
		.bind(rule.bucket, rule.key, windowStart)
		.first<{ count: number }>();
	const count = Number(row?.count ?? 1);
	return {
		allowed: count <= rule.limit,
		retryAfterSeconds: windowStart + rule.windowSeconds - nowSeconds,
		bucket: rule.bucket,
	};
}

/** Counts every rule (so attackers cannot probe one bucket) and returns the first refusal. */
export async function checkRateLimits(
	db: SqlDb,
	rules: RateRule[],
	nowMs: number = Date.now(),
): Promise<RateDecision> {
	let refusal: RateDecision | null = null;
	for (const rule of rules) {
		const decision = await hitRateLimit(db, rule, nowMs);
		if (!decision.allowed && !refusal) refusal = decision;
	}
	return refusal ?? { allowed: true, retryAfterSeconds: 0, bucket: "" };
}

export async function purgeOldRateWindows(db: SqlDb, nowMs: number = Date.now()): Promise<void> {
	const cutoff = Math.floor(nowMs / 1000) - 2 * 86_400;
	await db.prepare(`DELETE FROM as_rate_limits WHERE window_start < ?`).bind(cutoff).run();
}
