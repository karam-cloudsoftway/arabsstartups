/** Email bodies (plain text + branded HTML). Never include private internal notes. */
import { renderEmailHtml } from "./layout";
import { oneLine } from "./send";

export function inquiryReplyHtml(input: {
	reply: string;
	signature: string;
	originalSubject: string;
	originalMessage: string;
	locale: string;
	origin: string;
}): string {
	const en = input.locale === "en";
	return renderEmailHtml({
		locale: en ? "en" : "ar",
		origin: input.origin,
		preheader: oneLine(input.reply, 120),
		eyebrow: en ? "Reply from the editorial team" : "ردّ من فريق التحرير",
		heading: oneLine(input.originalSubject, 150),
		blocks: [
			{ kind: "text", text: input.reply },
			{ kind: "text", text: `—\n${input.signature}` },
			{ kind: "muted", text: en ? "Your original message:" : "رسالتك الأصلية:" },
			{ kind: "quote", text: input.originalMessage.slice(0, 1500) },
		],
		footnote: en
			? "You received this email because you contacted Arabs Startups. Reply to this email to continue the conversation."
			: "وصلك هذا البريد لأنك راسلت Arabs Startups. يمكنك الردّ على هذا البريد لمتابعة المحادثة.",
	});
}

export function inquiryReplySubject(subject: string): string {
	const clean = oneLine(subject, 150);
	return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

export function inquiryReplyText(input: {
	reply: string;
	signature: string;
	originalSubject: string;
	originalMessage: string;
	locale: string;
}): string {
	const quoted = input.originalMessage
		.slice(0, 1500)
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
	const intro = input.locale === "en" ? "Your original message" : "رسالتك الأصلية";
	return [
		input.reply.trim(),
		"",
		"—",
		input.signature,
		"",
		`${intro}: ${oneLine(input.originalSubject, 150)}`,
		quoted,
	].join("\n");
}
