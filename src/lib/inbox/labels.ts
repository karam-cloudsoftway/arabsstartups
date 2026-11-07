import type { InquiryStatus } from "./validation";

export const STATUS_LABELS: Record<InquiryStatus, string> = {
	new: "جديدة",
	in_progress: "قيد المتابعة",
	responded: "تمّ الردّ",
	closed: "مغلقة",
	spam: "مزعجة",
};

export const COMMENT_STATUS_LABELS: Record<string, string> = {
	pending: "بانتظار المراجعة",
	approved: "منشور",
	spam: "مزعج",
	trash: "محذوف",
};
