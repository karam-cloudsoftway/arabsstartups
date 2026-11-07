/** Plain-text email bodies. Never include private internal notes. */
import { oneLine } from "./send";

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
