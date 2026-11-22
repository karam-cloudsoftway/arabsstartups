import { beforeEach, describe, expect, it, vi } from "vitest";
import { toEmbed } from "../../src/lib/content/embeds";
import { applyMigrations } from "../../src/lib/db/migrations";
import { alertRecipients, sendStaffAlert, setAlertPrefs } from "../../src/lib/email/alerts";
import { sendEmail } from "../../src/lib/email/send";
import { inquiryReplySubject, inquiryReplyText } from "../../src/lib/email/templates";
import { createEmDashTables, createTestDb } from "./helpers/sqlite-d1";

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => {
	db = createTestDb();
	createEmDashTables(db);
	await applyMigrations(db);
});

describe("sendEmail", () => {
	it("sends plain text through Resend with a one-line subject", async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
		const result = await sendEmail(db, { resendApiKey: "re_key", mailFrom: "A <a@x.com>", devOutbox: false, fetchImpl: fetchImpl as unknown as typeof fetch }, {
			to: "reader@example.com",
			subject: "Re: hello\r\nBcc: victim@example.com",
			text: "body",
			replyTo: "hello@arabsstartups.com",
		});
		expect(result).toEqual({ ok: true, providerId: "resend:abc" });
		const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		const sent = JSON.parse(String(init.body));
		expect(sent.subject).toBe("Re: hello Bcc: victim@example.com");
		expect(sent.to).toEqual(["reader@example.com"]);
		expect(sent.reply_to).toBe("hello@arabsstartups.com");
		expect(sent.html).toBeUndefined();
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
	});
	it("refuses bad recipients and reports provider failures", async () => {
		const settings = { resendApiKey: "k", mailFrom: "a@x.com", devOutbox: false };
		expect(await sendEmail(db, settings, { to: "not an email", subject: "s", text: "t" })).toEqual({ ok: false, reason: "invalid_recipient" });
		const failing = vi.fn(async () => new Response("no", { status: 500 }));
		expect(await sendEmail(db, { ...settings, fetchImpl: failing as unknown as typeof fetch }, { to: "a@b.co", subject: "s", text: "t" })).toEqual({ ok: false, reason: "provider_error" });
	});
	it("uses the dev outbox locally and refuses in production without a key", async () => {
		const dev = await sendEmail(db, { resendApiKey: "", mailFrom: "a@x.com", devOutbox: true }, { to: "a@b.co", subject: "s", text: "t" });
		expect(dev.ok && dev.providerId.startsWith("dev-outbox:")).toBe(true);
		expect(await sendEmail(db, { resendApiKey: "", mailFrom: "a@x.com", devOutbox: false }, { to: "a@b.co", subject: "s", text: "t" })).toEqual({ ok: false, reason: "not_configured" });
	});
});

describe("staff alerts", () => {
	beforeEach(() => {
		db.raw.exec(`
			INSERT INTO users (id, email, role, disabled) VALUES
			  ('a1', 'a1@x.com', 50, 0), ('e1', 'e1@x.com', 40, 0), ('e2', 'e2@x.com', 40, 1),
			  ('w1', 'w1@x.com', 30, 0), ('c1', 'c1@x.com', 20, 0), ('s1', 's1@x.com', 10, 0);
		`);
	});
	const mail = { resendApiKey: "", mailFrom: "a@x.com", devOutbox: true };
	const origin = "https://arabsstartups.com";

	it("inquiries go to every active Contributor, Author, Editor and Admin, unless they turned them off", async () => {
		expect(await alertRecipients(db, "inquiries", "desk@x.com")).toEqual(["a1@x.com", "e1@x.com", "w1@x.com", "c1@x.com"]);
		await setAlertPrefs(db, "e1", { inquiries: false, comments: true });
		expect(await alertRecipients(db, "inquiries", "desk@x.com")).toEqual(["a1@x.com", "w1@x.com", "c1@x.com"]);
	});

	it("comments go only to active, opted-in Editors/Admins (or the fallback address)", async () => {
		expect(await alertRecipients(db, "comments", "desk@x.com")).toEqual(["desk@x.com"]);
		await setAlertPrefs(db, "e1", { inquiries: true, comments: true });
		await setAlertPrefs(db, "e2", { inquiries: true, comments: true });
		await setAlertPrefs(db, "c1", { inquiries: true, comments: true });
		expect(await alertRecipients(db, "comments", "")).toEqual(["e1@x.com"]);
	});

	it("one inquiry alert per submission, without the message; only editors get the inbox link", async () => {
		expect(await sendStaffAlert(db, mail, { kind: "inquiries", origin, fallback: "", category: "founder_story" })).toBe(4);
		expect(await sendStaffAlert(db, mail, { kind: "inquiries", origin, fallback: "" })).toBe(4);
		const rows = (await db.prepare("SELECT to_addr, subject, body FROM as_dev_outbox").all<{ to_addr: string; subject: string; body: string }>()).results;
		expect(rows).toHaveLength(8);
		const story = rows.find((row) => row.to_addr === "e1@x.com" && row.subject.includes("قصة"));
		expect(story?.body).toContain(`${origin}/newsroom/inbox`);
		expect(story?.body).toContain("قصة مؤسّس");
		const contributor = rows.find((row) => row.to_addr === "c1@x.com");
		expect(contributor?.body).not.toContain("/newsroom");
	});

	it("comment alerts are throttled to one per 15 minutes", async () => {
		await setAlertPrefs(db, "e1", { inquiries: true, comments: true });
		expect(await sendStaffAlert(db, mail, { kind: "comments", origin, fallback: "" })).toBe(1);
		expect(await sendStaffAlert(db, mail, { kind: "comments", origin, fallback: "" })).toBe(0);
	});
});

describe("reply template", () => {
	it("quotes the original message and never includes internal notes", () => {
		const text = inquiryReplyText({ reply: "شكرًا", signature: "فريق", originalSubject: "خبر", originalMessage: "سطر ١\nسطر ٢", locale: "ar" });
		expect(text).toContain("> سطر ١\n> سطر ٢");
		expect(inquiryReplySubject("خبر")).toBe("Re: خبر");
		expect(inquiryReplySubject("RE: خبر")).toBe("RE: خبر");
	});
});

describe("embeds allow-list", () => {
	it("builds privacy-friendly players for known providers", () => {
		expect(toEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
		expect(toEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
		expect(toEmbed("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk")?.src).toBe("https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk");
		expect(toEmbed("https://vimeo.com/76979871")?.src).toBe("https://player.vimeo.com/video/76979871");
		expect(toEmbed("https://www.linkedin.com/posts/someone_activity-7123456789012345678-abcd")?.src).toBe("https://www.linkedin.com/embed/feed/update/urn:li:activity:7123456789012345678");
	});
	it("refuses anything else", () => {
		expect(toEmbed("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull(); // not https
		expect(toEmbed("javascript:alert(1)")).toBeNull();
		expect(toEmbed("https://evil.example/embed/x")).toBeNull();
		expect(toEmbed("https://www.youtube.com/watch?v=<script>")).toBeNull();
		expect(toEmbed("https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ")).toBeNull();
	});
});
