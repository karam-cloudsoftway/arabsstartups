/**
 * Editorial gate: an article can be published (now or scheduled) only when
 * its "Editorial review status" is "Approved". The CMS shows the reason to
 * the editor, so a draft still being written cannot go live by mistake.
 * Pages and episodes are not affected.
 */
import { definePlugin } from "emdash";
import { EDITORIAL_STATUSES, editorialStatusKey } from "../lib/content/options";

export const NOT_APPROVED_REASON = `لا يمكن نشر المقال قبل اعتماده: اختر «${EDITORIAL_STATUSES.approved}» في «حالة المراجعة التحريرية» واحفظ، ثم انشر. · This article can't be published until its Editorial review status is "Approved".`;

/** Pure check, exported for tests. */
export function editorialDecision(event: { collection: string; content: Record<string, unknown> }) {
	if (event.collection !== "posts") return undefined;
	const data = (event.content.data ?? event.content) as Record<string, unknown>;
	return editorialStatusKey(data.editorial_status) === "approved"
		? undefined
		: ({ cancel: true, reason: NOT_APPROVED_REASON } as const);
}

/** Native-format entrypoint: EmDash imports this and calls it at build time. */
export function createPlugin() {
	return definePlugin({
		id: "as-editorial-gate",
		version: "1.0.0",
		capabilities: ["hooks.content-policy:register"],
		hooks: {
			"content:beforePublish": async (event) => editorialDecision(event),
			"content:beforeSchedule": async (event) => editorialDecision(event),
		},
	});
}
