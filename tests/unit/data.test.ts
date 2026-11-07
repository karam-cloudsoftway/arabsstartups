import { beforeEach, describe, expect, it } from "vitest";
import { listAudit, writeAudit } from "../../src/lib/audit/log";
import { diffRoster, syncRoster } from "../../src/lib/audit/roster";
import { applyMigrations, ensureSchema } from "../../src/lib/db/migrations";
import { getHashSalt } from "../../src/lib/db/settings";
import { toCsv, csvCell } from "../../src/lib/inbox/csv";
import {
	addNote,
	assign,
	countByStatus,
	createInquiry,
	deleteInquiry,
	findRecentDuplicate,
	getInquiry,
	listInquiries,
	listNotes,
	purgeExpired,
	setStatus,
} from "../../src/lib/inbox/repo";
import { contactSchema, issuesToFields } from "../../src/lib/inbox/validation";
import { checkRateLimits, hitRateLimit } from "../../src/lib/security/rate-limit";
import { createEmDashTables, createTestDb } from "./helpers/sqlite-d1";

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => {
	db = createTestDb();
	createEmDashTables(db);
	await applyMigrations(db);
});

const sample = {
	name: "سارة",
	email: "sara@example.com",
	category: "news_tip" as const,
	subject: "خبر إطلاق",
	message: "رسالة اختبار طويلة بما يكفي.",
	organization: "",
	website: "",
	locale: "ar",
	ipHash: "h",
	contentHash: "c1",
};

describe("migrations", () => {
	it("are applied once and are idempotent", async () => {
		expect(await applyMigrations(db)).toEqual([]);
		await ensureSchema(db);
		await ensureSchema(db);
		const row = await db.prepare("SELECT COUNT(*) AS n FROM as_schema_migrations").first<{ n: number }>();
		expect(row?.n).toBe(1);
	});
	it("enforce valid statuses at the database level", async () => {
		const id = await createInquiry(db, sample, { retentionDays: 30 });
		await expect(db.prepare("UPDATE as_inquiries SET status = 'hacked' WHERE id = ?").bind(id).run()).rejects.toThrow();
	});
});

describe("rate limiter", () => {
	it("allows up to the limit inside a window, then refuses", async () => {
		const rule = { bucket: "t", key: "k", limit: 3, windowSeconds: 60 };
		const now = 1_000_000_000_000;
		const results = [];
		for (let i = 0; i < 4; i++) results.push((await hitRateLimit(db, rule, now)).allowed);
		expect(results).toEqual([true, true, true, false]);
		expect((await hitRateLimit(db, rule, now + 61_000)).allowed).toBe(true);
	});
	it("counts every rule and reports the first refusal", async () => {
		const rules = [
			{ bucket: "a", key: "k", limit: 1, windowSeconds: 60 },
			{ bucket: "b", key: "k", limit: 5, windowSeconds: 60 },
		];
		await checkRateLimits(db, rules, 5_000);
		const second = await checkRateLimits(db, rules, 5_000);
		expect(second).toMatchObject({ allowed: false, bucket: "a" });
		const b = await db.prepare("SELECT count FROM as_rate_limits WHERE bucket = 'b'").first<{ count: number }>();
		expect(b?.count).toBe(2);
	});
});

describe("contact validation", () => {
	const valid = { name: "سارة أحمد", email: " Sara@Example.com ", category: "news_tip", subject: "خبر عن إطلاق", message: "هذه رسالة اختبار كافية الطول." };
	it("normalises valid input", () => {
		const result = contactSchema.parse(valid);
		expect(result.email).toBe("sara@example.com");
		expect(result.locale).toBe("ar");
	});
	it("rejects HTML, too many links, URL names, bad categories and bad websites", () => {
		const cases: Array<[Record<string, unknown>, string, string]> = [
			[{ message: "<b>hello</b> this is long enough" }, "message", "no_html"],
			[{ message: "http://a.com http://b.com http://c.com http://d.com go" }, "message", "too_many_links"],
			[{ name: "buy-now.com" }, "name", "name_has_url"],
			[{ category: "hacking" }, "category", "invalid"],
			[{ orgWebsite: "javascript:alert(1)" }, "orgWebsite", "bad_url"],
			[{ message: "short" }, "message", "too_short"],
		];
		for (const [patch, fieldName, code] of cases) {
			const result = contactSchema.safeParse({ ...valid, ...patch });
			expect(result.success, JSON.stringify(patch)).toBe(false);
			if (!result.success) expect(issuesToFields(result.error)[fieldName]).toBe(code);
		}
	});
});

describe("inbox repository", () => {
	it("creates, lists with filters, and searches safely", async () => {
		await createInquiry(db, sample, { retentionDays: 30 });
		await createInquiry(db, { ...sample, email: "b@example.com", subject: "100% مضمون_جدًا", category: "general", contentHash: "c2" }, { retentionDays: 30 });
		expect((await listInquiries(db, {})).total).toBe(2);
		expect((await listInquiries(db, { category: "general" })).total).toBe(1);
		expect((await listInquiries(db, { q: "100%" })).total).toBe(1);
		expect((await listInquiries(db, { q: "%" })).total).toBe(1); // wildcard is literal
		expect((await listInquiries(db, { q: "_" })).total).toBe(1);
		expect((await listInquiries(db, { statuses: ["closed"] })).total).toBe(0);
	});
	it("detects duplicates within 24 hours", async () => {
		const id = await createInquiry(db, sample, { retentionDays: 30 });
		expect(await findRecentDuplicate(db, sample.email, "c1")).toBe(id);
		expect(await findRecentDuplicate(db, sample.email, "other")).toBeNull();
		expect(await findRecentDuplicate(db, sample.email, "c1", new Date(Date.now() + 2 * 86_400_000))).toBeNull();
	});
	it("tracks status, assignment, notes and replies", async () => {
		const id = await createInquiry(db, sample, { retentionDays: 30 });
		await setStatus(db, id, "in_progress");
		await assign(db, id, "editor-1");
		await addNote(db, { inquiryId: id, kind: "note", authorId: "e1", authorName: "E", body: "internal" });
		await addNote(db, { inquiryId: id, kind: "reply", authorId: "e1", authorName: "E", body: "reply", providerMessageId: "dev-outbox:1" });
		const inquiry = await getInquiry(db, id);
		expect(inquiry?.status).toBe("responded");
		expect(inquiry?.responded_at).toBeTruthy();
		expect(inquiry?.assigned_editor_id).toBe("editor-1");
		expect((await listNotes(db, id)).map((n) => n.kind)).toEqual(["note", "reply"]);
		const counts = await countByStatus(db);
		expect(counts.responded).toBe(1);
	});
	it("deletes a message with its notes, and purges expired ones", async () => {
		const id = await createInquiry(db, sample, { retentionDays: 30 });
		await addNote(db, { inquiryId: id, kind: "note", authorId: "e1", authorName: "E", body: "x" });
		expect(await deleteInquiry(db, id)).toBe(true);
		expect(await listNotes(db, id)).toEqual([]);
		await createInquiry(db, { ...sample, contentHash: "old" }, { retentionDays: 1, now: new Date(Date.now() - 3 * 86_400_000) });
		await createInquiry(db, { ...sample, contentHash: "new" }, { retentionDays: 30 });
		expect(await purgeExpired(db)).toBe(1);
		expect((await listInquiries(db, {})).total).toBe(1);
	});
});

describe("CSV export", () => {
	it("neutralises spreadsheet formulas and quotes properly", () => {
		expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
		expect(csvCell("+1")).toBe("'+1");
		expect(csvCell("-2")).toBe("'-2");
		expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
		expect(csvCell("سطر\nجديد")).toBe('"سطر\nجديد"');
		const csv = toCsv([{ a: "x", b: null }], [{ key: "a", header: "A" }, { key: "b", header: "B" }]);
		expect(csv.startsWith("\uFEFFA,B\r\nx,\r\n")).toBe(true);
	});
});

describe("audit and staff roster", () => {
	it("writes and lists audit entries newest first", async () => {
		await writeAudit(db, { action: "inquiry.note", actorEmail: "a@x.com" }, new Date("2026-01-01"));
		await writeAudit(db, { action: "inquiry.reply", actorEmail: "a@x.com" }, new Date("2026-01-02"));
		expect((await listAudit(db)).map((e) => e.action)).toEqual(["inquiry.reply", "inquiry.note"]);
		expect((await listAudit(db, { action: "inquiry.note" })).length).toBe(1);
	});
	it("diffs staff changes: added, role change, disable, enable, removed", () => {
		const changes = diffRoster(
			[
				{ user_id: "1", email: "a@x", role: 20, disabled: 0 },
				{ user_id: "2", email: "b@x", role: 40, disabled: 0 },
				{ user_id: "3", email: "c@x", role: 40, disabled: 1 },
				{ user_id: "4", email: "d@x", role: 30, disabled: 0 },
			],
			[
				{ id: "1", email: "a@x", role: 40, disabled: 0 },
				{ id: "2", email: "b@x", role: 40, disabled: 1 },
				{ id: "3", email: "c@x", role: 40, disabled: 0 },
				{ id: "5", email: "e@x", role: 20, disabled: 0 },
			],
		);
		expect(changes.map((c) => `${c.action}:${c.userId}`).sort()).toEqual(
			["staff.added:5", "staff.disabled:2", "staff.enabled:3", "staff.removed:4", "staff.role_changed:1"].sort(),
		);
	});
	it("records detected changes in the audit log and updates the snapshot", async () => {
		db.raw.exec(`INSERT INTO users (id, email, role, disabled) VALUES ('u1', 'owner@x.com', 50, 0)`);
		expect((await syncRoster(db)).map((c) => c.action)).toEqual(["staff.added"]);
		expect(await syncRoster(db)).toEqual([]);
		db.raw.exec(`UPDATE users SET disabled = 1 WHERE id = 'u1'`);
		expect((await syncRoster(db)).map((c) => c.action)).toEqual(["staff.disabled"]);
		const actions = (await listAudit(db)).map((e) => e.action);
		expect(actions).toContain("staff.disabled");
	});
});

describe("hash salt", () => {
	it("is generated once and stable", async () => {
		const a = await getHashSalt(db);
		expect(a.length).toBeGreaterThan(30);
		expect(await getHashSalt(db)).toBe(a);
	});
});
