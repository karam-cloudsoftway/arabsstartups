/** EmDash role levels (see @emdash-cms/auth rbac). */
export const ROLE = {
	SUBSCRIBER: 10,
	CONTRIBUTOR: 20,
	AUTHOR: 30,
	EDITOR: 40,
	ADMIN: 50,
} as const;

export type RoleLevel = (typeof ROLE)[keyof typeof ROLE];

const LABELS_AR: Record<number, string> = {
	10: "مشترك",
	20: "مساهم",
	30: "كاتب",
	40: "محرّر",
	50: "مدير",
};

export function roleLabel(role: number): string {
	return LABELS_AR[role] ?? `دور ${role}`;
}

/** What each newsroom capability requires. One table, used everywhere. */
export const NEWSROOM_PERMISSIONS = {
	"inbox:read": ROLE.EDITOR,
	"inbox:manage": ROLE.EDITOR,
	"inbox:delete": ROLE.ADMIN,
	"inbox:export": ROLE.ADMIN,
	"comments:reply": ROLE.EDITOR,
	"comments:moderate": ROLE.EDITOR,
	"audit:read": ROLE.ADMIN,
	"team:read": ROLE.ADMIN,
	"alerts:self": ROLE.EDITOR,
} as const;

export type NewsroomPermission = keyof typeof NEWSROOM_PERMISSIONS;

export function can(user: { role: number } | null | undefined, permission: NewsroomPermission): boolean {
	return !!user && user.role >= NEWSROOM_PERMISSIONS[permission];
}
