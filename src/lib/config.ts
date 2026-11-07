/**
 * Runtime configuration — the ONLY module that reads environment values.
 *
 * Values come from Worker vars and secrets (wrangler.jsonc + `wrangler secret
 * put`), exposed on `process.env` by the `nodejs_compat` flag. Never read
 * secrets through `import.meta.env`: Vite would inline them into the bundle.
 */

export interface AppConfig {
	turnstileSiteKey: string;
	turnstileSecret: string;
	/** When non-empty, Turnstile runs in strict mode (hostname + action must match). */
	turnstileAllowedHostnames: string[];
	accessTeamDomain: string;
	accessAudience: string;
	resendApiKey: string;
	mailFrom: string;
	mailReplyTo: string;
	editorialAlertEmail: string;
	inquiryRetentionDays: number;
	beaconToken: string;
}

function str(value: string | undefined): string {
	return typeof value === "string" ? value.trim() : "";
}

function list(value: string | undefined): string[] {
	return str(value)
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
}

function positiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(str(value), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readConfig(source: Record<string, string | undefined>): AppConfig {
	return {
		turnstileSiteKey: str(source.PUBLIC_TURNSTILE_SITE_KEY),
		turnstileSecret: str(source.TURNSTILE_SECRET_KEY),
		turnstileAllowedHostnames: list(source.TURNSTILE_ALLOWED_HOSTNAMES),
		accessTeamDomain: str(source.CF_ACCESS_TEAM_DOMAIN).toLowerCase(),
		accessAudience: str(source.CF_ACCESS_AUDIENCE),
		resendApiKey: str(source.RESEND_API_KEY),
		mailFrom: str(source.MAIL_FROM) || "Arabs Startups <hello@arabsstartups.com>",
		mailReplyTo: str(source.MAIL_REPLY_TO),
		editorialAlertEmail: str(source.EDITORIAL_ALERT_EMAIL),
		inquiryRetentionDays: positiveInt(source.INQUIRY_RETENTION_DAYS, 365),
		beaconToken: str(source.PUBLIC_CF_BEACON_TOKEN),
	};
}

export function getConfig(): AppConfig {
	const source = typeof process !== "undefined" && process.env ? process.env : {};
	return readConfig(source);
}
