/** Locale helpers. Arabic is the default (unprefixed); English lives under /en. */
import { ar } from "./ar";
import { en } from "./en";

export type Locale = "ar" | "en";
export type Dictionary = typeof ar;

const DICTIONARIES: Record<Locale, Dictionary> = { ar, en };

export const LOCALE_META: Record<Locale, { dir: "rtl" | "ltr"; dateLocale: string; ogLocale: string }> = {
	// Arabic month names with Western digits: matches our LTR treatment of numbers.
	ar: { dir: "rtl", dateLocale: "ar-u-nu-latn", ogLocale: "ar_AR" },
	en: { dir: "ltr", dateLocale: "en-GB", ogLocale: "en_US" },
};

export function t(locale: Locale): Dictionary {
	return DICTIONARIES[locale];
}

export function localeFromPath(pathname: string): Locale {
	return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "ar";
}

/** Build a path in the given locale. `path` is the Arabic (unprefixed) path. */
export function localePath(locale: Locale, path: string): string {
	const clean = path.startsWith("/") ? path : `/${path}`;
	if (locale === "ar") return clean;
	return clean === "/" ? "/en" : `/en${clean}`;
}

/** The same page in the other language. */
export function alternatePath(pathname: string): { locale: Locale; path: string } {
	if (localeFromPath(pathname) === "en") {
		const stripped = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
		return { locale: "ar", path: stripped };
	}
	return { locale: "en", path: localePath("en", pathname) };
}

export function formatDate(date: Date | string | null | undefined, locale: Locale, withTime = false): string {
	if (!date) return "";
	const value = typeof date === "string" ? new Date(date) : date;
	if (Number.isNaN(value.getTime())) return "";
	return new Intl.DateTimeFormat(LOCALE_META[locale].dateLocale, {
		year: "numeric",
		month: "long",
		day: "numeric",
		...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
	}).format(value);
}

export function isoDate(date: Date | string | null | undefined): string | undefined {
	if (!date) return undefined;
	const value = typeof date === "string" ? new Date(date) : date;
	return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}
