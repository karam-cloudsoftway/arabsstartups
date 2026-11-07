import { beforeEach, describe, expect, it } from "vitest";
import { commentSchema, STAFF_TEAM_NAME, staffReplySchema } from "../../src/lib/comments/policy";
import {
	checkCommentable,
	createStaffReply,
	resolveParent,
	submitVisitorComment,
	type CreateCommentRecord,
} from "../../src/lib/comments/service";
import { applyMigrations } from "../../src/lib/db/migrations";
import { authorizeStaff, sqlStaffLookup } from "../../src/lib/staff/guard";
import { can, ROLE } from "../../src/lib/staff/roles";
import { createEmDashTables, createTestDb } from "./helpers/sqlite-d1";

let db: ReturnType<typeof createTestDb>;
const written: CreateCommentRecord[] = [];
const write = async (record: CreateCommentRecord) => {
	written.push(record);
	const id = `c${written.length}`;
	db.raw
		.prepare(
			`INSERT INTO _emdash_comments (id, collection, content_id, parent_id, author_name, author_email, author_user_id, body, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(id, record.collection, record.contentId, record.parentId, record.authorName, record.authorEmail, record.authorUserId, record.body, record.status, new Date().toISOString());
	return { id, status: record.status };
};

beforeEach(async () => {
	written.length = 0;
	db = createTestDb();
	createEmDashTables(db);
	await applyMigrations(db);
	db.raw.exec(`
		INSERT INTO _emdash_collections (slug, comments_enabled, comments_closed_after_days) VALUES ('posts', 1, 90);
		INSERT INTO ec_posts (id, slug, title, status, published_at) VALUES ('p1', 'one', 'One', 'published', '${new Date().toISOString()}');
		INSERT INTO ec_posts (id, slug, title, status, published_at) VALUES ('p-old', 'old', 'Old', 'published', '2020-01-01T00:00:00.000Z');
		INSERT INTO ec_posts (id, slug, title, status, published_at) VALUES ('p-draft', 'draft', 'Draft', 'draft', NULL);
		INSERT INTO _emdash_comments (id, collection, content_id, author_name, author_email, body, status) VALUES ('approved1', 'posts', 'p1', 'A', 'a@x.com', 'hi', 'approved');
		INSERT INTO _emdash_comments (id, collection, content_id, author_name, author_email, body, status) VALUES ('pending1', 'posts', 'p1', 'B', 'b@x.com', 'hi', 'pending');
		INSERT INTO _emdash_comments (id, collection, content_id, parent_id, author_name, author_email, body, status) VALUES ('reply1', 'posts', 'p1', 'approved1', 'C', 'c@x.com', 'yo', 'approved');
		INSERT INTO users (id, email, name, role, disabled) VALUES ('ed', 'Editor@Arabsstartups.com', 'محرّر', 40, 0);
		INSERT INTO users (id, email, name, role, disabled) VALUES ('co', 'contrib@arabsstartups.com', 'مساهم', 20, 0);
		INSERT INTO users (id, email, name, role, disabled) VALUES ('ad', 'admin@arabsstartups.com', 'مدير', 50, 0);
		INSERT INTO users (id, email, name, role, disabled) VALUES ('gone', 'gone@arabsstartups.com', 'سابق', 50, 1);
	`);
});

const visitor = { contentId: "p1", authorName: "قارئ", authorEmail: "r@example.com", body: "تعليق مفيد", locale: "ar" };
const meta = { ipHash: "ip", userAgent: "UA" };

describe("visitor comments", () => {
	it("are always stored as pending, never auto-published", async () => {
		const result = await submitVisitorComment(db, write, visitor, meta);
		expect(result.ok).toBe(true);
		expect(written[0]?.status).toBe("pending");
		expect(written[0]?.authorUserId).toBeNull();
	});
	it("are refused on drafts, missing posts, closed posts and disabled collections", async () => {
		expect(await submitVisitorComment(db, write, { ...visitor, contentId: "p-draft" }, meta)).toEqual({ ok: false, reason: "content_not_found" });
		expect(await submitVisitorComment(db, write, { ...visitor, contentId: "nope" }, meta)).toEqual({ ok: false, reason: "content_not_found" });
		expect(await submitVisitorComment(db, write, { ...visitor, contentId: "p-old" }, meta)).toEqual({ ok: false, reason: "comments_closed" });
		db.raw.exec(`UPDATE _emdash_collections SET comments_enabled = 0`);
		expect(await checkCommentable(db, "p1")).toEqual({ ok: false, reason: "comments_disabled" });
	});
	it("can only reply to approved comments on the same article, flattened to one level", async () => {
		expect(await resolveParent(db, "p1", "pending1", { requireApproved: true })).toEqual({ ok: false, reason: "parent_not_found" });
		expect(await resolveParent(db, "p-old", "approved1", { requireApproved: true })).toEqual({ ok: false, reason: "parent_not_found" });
		const nested = await resolveParent(db, "p1", "reply1", { requireApproved: true });
		expect(nested.ok && nested.parentId).toBe("approved1");
	});
	it("refuses exact duplicates from the same person", async () => {
		await submitVisitorComment(db, write, visitor, meta);
		expect(await submitVisitorComment(db, write, { ...visitor, authorEmail: "R@example.com".toLowerCase() }, meta)).toEqual({ ok: false, reason: "duplicate" });
	});
	it("schema rejects HTML, link spam and malformed IDs, and normalises email", () => {
		const input = { ...visitor, contentId: "01M6VY6Y2QWXSHMJ8GJTAXPFQP" };
		expect(commentSchema.parse({ ...input, parentId: "" }).parentId).toBeNull(); // the form's empty hidden field
		expect(commentSchema.safeParse({ ...input, body: "<a href=x>x</a>" }).success).toBe(false);
		expect(commentSchema.safeParse({ ...input, body: "http://a.com http://b.com http://c.com" }).success).toBe(false);
		expect(commentSchema.safeParse({ ...input, contentId: "x' OR 1=1 --" }).success).toBe(false);
		expect(commentSchema.parse({ ...input, authorEmail: " R@Example.COM " }).authorEmail).toBe("r@example.com");
	});
});

describe("staff replies", () => {
	const staff = { id: "ed", email: "editor@arabsstartups.com", name: "محرّر" };
	it("are approved, linked to the staff account, and attach to the thread root", async () => {
		const result = await createStaffReply(db, write, { commentId: "reply1", body: "شكرًا", identity: "team", staff });
		expect(result).toMatchObject({ ok: true, parentId: "approved1", contentId: "p1" });
		expect(written[0]).toMatchObject({ status: "approved", authorUserId: "ed", authorName: STAFF_TEAM_NAME });
	});
	it("can be signed with the editor's own name", async () => {
		await createStaffReply(db, write, { commentId: "approved1", body: "شكرًا", identity: "self", staff });
		expect(written[0]?.authorName).toBe("محرّر");
	});
	it("cannot target a pending (unpublished) comment", async () => {
		expect(await createStaffReply(db, write, { commentId: "pending1", body: "x", identity: "team", staff })).toEqual({ ok: false, reason: "parent_not_found" });
		expect(staffReplySchema.safeParse({ commentId: "approved1", body: "<script>", identity: "team" }).success).toBe(false);
	});
});

describe("newsroom access rule", () => {
	const lookup = () => sqlStaffLookup(db);
	const prodIdentity = (email: string) => ({ email, subject: "s", issuedAt: 1, expiresAt: 2 });

	it("production: requires a verified Access identity and ignores the session", async () => {
		expect(await authorizeStaff({ production: true, accessIdentity: null, sessionUserId: "ad" }, lookup(), "inbox:read")).toEqual({ ok: false, status: 401, reason: "no-identity" });
	});
	it("production: unknown, disabled and under-privileged people are refused", async () => {
		expect(await authorizeStaff({ production: true, accessIdentity: prodIdentity("stranger@x.com"), sessionUserId: null }, lookup(), "inbox:read")).toMatchObject({ ok: false, reason: "not-provisioned" });
		expect(await authorizeStaff({ production: true, accessIdentity: prodIdentity("gone@arabsstartups.com"), sessionUserId: null }, lookup(), "inbox:read")).toMatchObject({ ok: false, reason: "disabled" });
		expect(await authorizeStaff({ production: true, accessIdentity: prodIdentity("contrib@arabsstartups.com"), sessionUserId: null }, lookup(), "inbox:read")).toMatchObject({ ok: false, reason: "forbidden" });
	});
	it("matches emails case-insensitively and applies the permission table", async () => {
		const editor = await authorizeStaff({ production: true, accessIdentity: prodIdentity("editor@arabsstartups.com"), sessionUserId: null }, lookup(), "inbox:read");
		expect(editor.ok).toBe(true);
		expect(await authorizeStaff({ production: true, accessIdentity: prodIdentity("editor@arabsstartups.com"), sessionUserId: null }, lookup(), "inbox:export")).toMatchObject({ ok: false, reason: "forbidden" });
		expect((await authorizeStaff({ production: true, accessIdentity: prodIdentity("admin@arabsstartups.com"), sessionUserId: null }, lookup(), "inbox:export")).ok).toBe(true);
	});
	it("a disabled account loses access on the very next request", async () => {
		const facts = { production: true, accessIdentity: prodIdentity("admin@arabsstartups.com"), sessionUserId: null };
		expect((await authorizeStaff(facts, lookup(), "audit:read")).ok).toBe(true);
		db.raw.exec(`UPDATE users SET disabled = 1 WHERE id = 'ad'`);
		expect(await authorizeStaff(facts, lookup(), "audit:read")).toMatchObject({ ok: false, reason: "disabled" });
	});
	it("development: uses the local session", async () => {
		expect((await authorizeStaff({ production: false, accessIdentity: null, sessionUserId: "ed" }, lookup(), "comments:reply")).ok).toBe(true);
		expect(await authorizeStaff({ production: false, accessIdentity: null, sessionUserId: null }, lookup(), "comments:reply")).toMatchObject({ ok: false, status: 401 });
	});
	it("permission table keeps private data and exports away from non-admins", () => {
		expect(can({ role: ROLE.CONTRIBUTOR }, "inbox:read")).toBe(false);
		expect(can({ role: ROLE.AUTHOR }, "inbox:read")).toBe(false);
		expect(can({ role: ROLE.EDITOR }, "inbox:read")).toBe(true);
		expect(can({ role: ROLE.EDITOR }, "inbox:export")).toBe(false);
		expect(can({ role: ROLE.EDITOR }, "team:read")).toBe(false);
		expect(can({ role: ROLE.ADMIN }, "inbox:export")).toBe(true);
		expect(can(null, "alerts:self")).toBe(false);
	});
});
