/** Minimal, detail-free refusal page for the staff newsroom. */
import type { StaffDecision } from "./guard";

const MESSAGES: Record<string, string> = {
	"no-identity": "يجب تسجيل الدخول عبر Cloudflare Access للوصول إلى غرفة الأخبار.",
	"not-provisioned": "حسابك غير مفعّل بعد. افتح لوحة المحتوى مرة واحدة ثم اطلب من المدير منحك الصلاحية المناسبة.",
	disabled: "هذا الحساب معطّل.",
	forbidden: "ليست لديك صلاحية للوصول إلى هذه الصفحة.",
};

export function denyResponse(decision: Extract<StaffDecision, { ok: false }>): Response {
	const message = MESSAGES[decision.reason] ?? MESSAGES.forbidden;
	const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>غرفة الأخبار — غير مسموح</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;line-height:1.7"><h1>غير مسموح</h1><p>${message}</p><p><a href="/">العودة إلى الموقع</a></p></body></html>`;
	return new Response(html, {
		status: decision.status,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "private, no-store",
			"X-Robots-Tag": "noindex, nofollow",
		},
	});
}
