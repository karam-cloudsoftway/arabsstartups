/**
 * Every name editors see in the CMS, in Arabic and English, in one place.
 *
 * EmDash keeps ONE label per list and field (it has no per-language label),
 * so each label carries both languages: "المقالات · Articles". The words
 * match the website's own names (src/i18n/{ar,en}.ts).
 *
 * Used by scripts/build-seed.mjs (new installs) and scripts/cms-names-sql.mjs
 * (updates an existing database). Change a name here, then run both.
 */
import { readFileSync } from "node:fs";

const options = JSON.parse(readFileSync(new URL("../src/lib/content/cms-options.json", import.meta.url), "utf8"));

/** Bilingual dropdown choices; the stored value is the text (see options.ts). */
export const OPTIONS = {
	contentType: options.contentType,
	editorialStatus: options.editorialStatus,
	episodeType: options.episodeType,
};

export const COLLECTIONS = {
	posts: {
		label: "المقالات · Articles",
		labelSingular: "مقال · Article",
		description:
			"كل الأخبار وقصص المؤسّسين. القسم يحدّد مكان الظهور: «الأخبار» ← صفحة News، «قصص المؤسّسين» ← صفحة Founder Stories. · " +
			"All news and founder stories. The Section decides where it shows: News → /news, Founder Stories → /stories.",
	},
	episodes: {
		label: "الندوات والبودكاست · Webinars & Podcasts",
		labelSingular: "حلقة · Episode",
		description: "الحلقات تظهر في صفحة «ندوات وبودكاست». · Episodes appear on the Webinars & Podcasts page (/episodes).",
	},
	pages: {
		label: "الصفحات · Pages",
		labelSingular: "صفحة · Page",
		description:
			"صفحات ثابتة مثل «من نحن» والسياسات. تظهر روابطها في الموقع بعد النشر فقط. · " +
			"Fixed pages such as About and the policies. The site links them only once published.",
	},
};

export const FIELD_LABELS = {
	posts: {
		title: "العنوان · Title",
		excerpt: "الملخّص · Summary",
		featured_image: "صورة الغلاف، مرخّصة فقط · Cover image (licensed only)",
		content: "النص · Body",
		content_label: "شارة المحتوى للقرّاء · Reader badge",
		editorial_status: "حالة المراجعة التحريرية · Editorial review status",
		source_name: "اسم المصدر · Source name",
		source_url: "رابط المصدر · Source link",
		corrections: "التصحيحات، تظهر للقرّاء · Corrections (shown to readers)",
		sample_content: "محتوى نموذجي، يُستبدل قبل الإطلاق · Sample content (replace before launch)",
	},
	episodes: {
		title: "العنوان · Title",
		excerpt: "الوصف · Description",
		episode_type: "نوع الحلقة · Episode type",
		recorded_at: "تاريخ التسجيل · Recorded on",
		guests: "الضيوف، بموافقتهم · Guests (with consent)",
		media_url: "رابط الحلقة: YouTube / Spotify / LinkedIn … · Episode link",
		featured_image: "صورة، مرخّصة فقط · Image (licensed only)",
		transcript: "النص المكتوب / الملاحظات · Transcript / notes",
	},
	pages: {
		title: "العنوان · Title",
		content: "النص · Body",
	},
};

/** Taxonomy names per content language (EmDash keeps one per locale). */
export const TAXONOMIES = {
	category: {
		ar: { label: "الأقسام · Sections", labelSingular: "قسم · Section" },
		en: { label: "Sections", labelSingular: "Section" },
	},
	tag: {
		ar: { label: "الوسوم · Tags", labelSingular: "وسم · Tag" },
		en: { label: "Tags", labelSingular: "Tag" },
	},
};

/** CMS Settings → Tagline is the Arabic footer line on the site. */
export const SITE_TAGLINE_AR = "منصّة إعلامية مستقلّة تغطّي الشركات الناشئة وروّاد الأعمال، تبدأ من سوريا وتتّسع نحو المنطقة العربية.";
