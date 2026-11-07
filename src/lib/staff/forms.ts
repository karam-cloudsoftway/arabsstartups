/**
 * Helpers for newsroom form posts (Post/Redirect/Get).
 * CSRF: Astro's checkOrigin blocks cross-site form posts, and we check the
 * Origin header again here before touching any data.
 */
import { isSameOriginRequest } from "../security/origin";

export const FLASH: Record<string, string> = {
	status: "تم تحديث الحالة.",
	assigned: "تم تحديث الإسناد.",
	note: "أُضيفت الملاحظة الداخلية.",
	replied: "أُرسل الردّ وسُجّل.",
	deleted: "حُذفت الرسالة نهائيًا.",
	alerts: "حُفظت تفضيلات التنبيه.",
	moderated: "تم تحديث حالة التعليق.",
	reply_posted: "نُشر ردّ فريق التحرير.",
	email_not_configured: "البريد الصادر غير مُعدّ؛ لم يُرسل الردّ.",
	email_failed: "تعذّر إرسال البريد؛ لم يُسجّل الردّ. حاول لاحقًا.",
	invalid: "البيانات المرسلة غير صالحة.",
	not_found: "العنصر غير موجود أو تغيّر.",
	forbidden: "ليست لديك صلاحية لهذا الإجراء.",
	stale: "تغيّرت حالة التعليق قبل حفظ الإجراء. حدّث الصفحة وأعد المحاولة.",
	fresh_auth: "هذا الإجراء يتطلّب تسجيل دخول حديث. سجّل الخروج ثم ادخل مجددًا وأعد المحاولة خلال ١٥ دقيقة.",
};

export async function readStaffForm(request: Request, origin: string): Promise<FormData | null> {
	if (request.method !== "POST" || !isSameOriginRequest(request, origin)) return null;
	const type = (request.headers.get("Content-Type") ?? "").toLowerCase();
	if (!type.startsWith("application/x-www-form-urlencoded") && !type.startsWith("multipart/form-data")) {
		return null;
	}
	const length = Number(request.headers.get("Content-Length") ?? "0");
	if (length > 64 * 1024) return null;
	try {
		return await request.formData();
	} catch {
		return null;
	}
}

export function field(form: FormData, name: string, max = 10_000): string {
	const value = form.get(name);
	return typeof value === "string" ? value.slice(0, max) : "";
}

export function flashFrom(url: URL): { kind: "ok" | "err"; text: string } | null {
	const ok = url.searchParams.get("ok");
	const err = url.searchParams.get("err");
	const code = ok ?? err;
	if (!code || !FLASH[code]) return null;
	return { kind: ok ? "ok" : "err", text: FLASH[code] };
}
