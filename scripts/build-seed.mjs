#!/usr/bin/env node
/**
 * Builds seed/seed.json — the CMS schema and the starter content.
 * Run: node scripts/build-seed.mjs
 *
 * Starter articles are clearly marked samples (`sample_content: true`); they
 * contain no invented facts, names, figures, partners or guests. Legal pages
 * are marked as drafts awaiting review.
 */
import { writeFileSync } from "node:fs";

let n = 0;
const key = () => `k${(n++).toString(36)}`;
const span = (text, marks = []) => ({ _type: "span", _key: key(), text, marks });
const block = (style, text, extra = {}) => ({
	_type: "block",
	_key: key(),
	style,
	markDefs: [],
	children: [span(text)],
	...extra,
});
const p = (text) => block("normal", text);
const h2 = (text) => block("h2", text);
const quote = (text) => block("blockquote", text);
const li = (text) => block("normal", text, { listItem: "bullet", level: 1 });
const ol = (text) => block("normal", text, { listItem: "number", level: 1 });

// Sample articles carry `sample_content: true`; the site shows a visible notice for them.
const DRAFT_LEGAL_AR = "مسودة أولية بانتظار المراجعة القانونية والتحريرية قبل الإطلاق.";
const DRAFT_LEGAL_EN = "Initial draft awaiting legal and editorial review before launch.";

const posts = [
	{
		id: "post-introducing",
		slug: "introducing-arabs-startups",
		status: "published",
		data: {
			title: "نبدأ من هنا: ما هي Arabs Startups؟",
			excerpt: "منصّة إعلامية تروي قصص الشركات الناشئة وروّاد الأعمال، تبدأ من سوريا وتتّسع نحو المنطقة العربية.",
			content_label: "news",
			sample_content: true,
			editorial_status: "approved",
			content: [
				p("ريادة الأعمال ليست إعلانات تمويل لامعة فحسب. هي أيضًا التجارب والإخفاقات والقرارات الصعبة والأشخاص الذين يقفون خلف كل شركة. أُنشئت Arabs Startups لتوثيق هذه الصورة كاملةً."),
				h2("ماذا نغطّي"),
				p("نبدأ من منظومة الشركات الناشئة في سوريا: الشركات التي تُبنى، والمؤسّسون الذين يخوضون المخاطرة، والداعمون الذين يفتحون الأبواب، والبرامج التي تحوّل الأفكار إلى أعمال حقيقية."),
				li("الأخبار: إطلاقات ومحطات ومستجدّات تهمّ روّاد الأعمال."),
				li("قصص المؤسّسين: حوارات عن القرار والتحوّل والدرس المستفاد."),
				li("ندوات وبودكاست: جلسات وتسجيلات مع أهل الميدان، تُضاف تدريجيًا."),
				h2("لمن نكتب"),
				p("للمؤسّسين، والطلبة الطامحين، والمستثمرين، وشركاء المنظومة، ولكل قارئ مهتمّ، لا لأصحاب رأس المال وحدهم."),
			],
		},
		bylines: [{ byline: "byline-editorial" }],
		taxonomies: { category: ["news"], tag: ["about-us"] },
	},
	{
		id: "post-founder-stories",
		slug: "why-founder-stories-matter",
		status: "published",
		data: {
			title: "لماذا تهمّ قصص المؤسّسين؟",
			excerpt: "خلف كل شركة رحلة حقيقية. نستكشف نقاط التحوّل والخيارات الصعبة والدروس العملية وراء العناوين.",
			content_label: "analysis",
			sample_content: true,
			editorial_status: "approved",
			content: [
				p("العنوان يحكي النتيجة، أمّا القصة فتحكي الطريق. في هذا القسم نجلس مع المؤسّسين لنفهم كيف بدأت الفكرة، ولماذا اختاروا هذا الطريق، وما الذي تعلّموه حين لم تسر الأمور كما خطّطوا."),
				h2("ما الذي نبحث عنه"),
				li("القرار الذي غيّر مسار الشركة."),
				li("اللحظة التي كاد فيها كل شيء يتوقّف."),
				li("الدرس الذي لا تتعلّمه إلا بالتجربة."),
				p("نروي هذه القصص باحترام، لا بوصفها محتوى مثيرًا، بل بوصفها معرفة يستفيد منها الجيل التالي من روّاد الأعمال. نحصل على موافقة الضيوف ونراجع الوقائع قبل النشر."),
			],
		},
		bylines: [{ byline: "byline-editorial" }],
		taxonomies: { category: ["founder-stories"], tag: ["founders"] },
	},
	{
		id: "post-questions",
		slug: "questions-we-ask-every-founder",
		status: "published",
		data: {
			title: "الأسئلة التي نطرحها على كل مؤسّس",
			excerpt: "نهجنا الشفاف في إعداد الحوارات: ماذا نسأل، ولماذا، وكيف نراجع ما يُنشر.",
			content_label: "analysis",
			sample_content: true,
			editorial_status: "approved",
			content: [
				p("نريد أن يعرف القارئ والضيف معًا كيف نعدّ حواراتنا. لذلك ننشر الأسئلة الأساسية التي ننطلق منها في كل حوار."),
				ol("ما المشكلة التي رأيتها، ولماذا قرّرت أن تحلّها أنت؟"),
				ol("ما أصعب قرار اتخذته حتى الآن؟"),
				ol("ما التجربة التي لم تنجح، وماذا تعلّمت منها؟"),
				ol("ما النصيحة التي كنت تتمنّى سماعها في البداية؟"),
				p("يراجع الضيف الاقتباسات المنسوبة إليه للتأكّد من دقّتها، ويبقى القرار التحريري لفريق Arabs Startups."),
			],
		},
		bylines: [{ byline: "byline-editorial" }],
		taxonomies: { category: ["founder-stories"], tag: ["founders", "editorial-process"] },
	},
	{
		id: "post-how-to-submit",
		slug: "how-to-send-us-your-story",
		status: "published",
		data: {
			title: "كيف تُرسل لنا خبرًا أو قصة؟",
			excerpt: "دليل مختصر لإرسال الأخبار وأفكار القصص ومقترحات التعاون، وما نتوقّعه من مصادر وتحقّق.",
			content_label: "news",
			sample_content: true,
			editorial_status: "approved",
			content: [
				p("نرحّب بالأخبار وأفكار القصص من المؤسّسين والمنظّمين وداعمي المنظومة. الإرسال لا يضمن النشر؛ تُراجَع كل المساهمات، ويجب توفير المصادر، ويُوضَّح المحتوى المدعوم بوضوح إن قُبل."),
				h2("قبل أن تُرسل"),
				ol("اذكر الوقائع الأساسية بإيجاز."),
				ol("أرفق المصادر أو جهة يمكن التحقّق منها."),
				ol("وضّح إن كان الخبر قابلًا للنشر الآن أو في موعد لاحق."),
				p("استخدم صفحة «اتصل بنا» واختر نوع الطلب المناسب."),
			],
		},
		bylines: [{ byline: "byline-editorial" }],
		taxonomies: { category: ["news"], tag: ["contributors"] },
	},
	{
		id: "post-introducing-en",
		slug: "introducing-arabs-startups",
		locale: "en",
		translationOf: "post-introducing",
		status: "published",
		data: {
			title: "Start here: what is Arabs Startups?",
			excerpt: "A media platform telling the stories of startups and founders, starting in Syria and growing across the Arab region.",
			content_label: "news",
			sample_content: true,
			editorial_status: "approved",
			content: [
				p("Entrepreneurship is not only fundraising announcements and launch stories. It is also the experiments, setbacks, difficult decisions and determined people behind every company. Arabs Startups exists to document that complete picture."),
				h2("What we cover"),
				p("We start with the Syrian startup ecosystem: the companies being built, the founders taking risks, the supporters opening doors, and the programs helping ideas become real businesses."),
			],
		},
		bylines: [{ byline: "byline-editorial" }],
		taxonomies: { category: ["news"], tag: ["about-us"] },
	},
];

const page = (id, slug, title, content, extra = {}) => ({ id, slug, status: "published", data: { title, content }, ...extra });

const pages = [
	page("page-about", "about", "من نحن", [
		p("ريادة الأعمال ليست إعلانات التمويل اللامعة وحدها. هي أيضًا التجارب والإخفاقات والقرارات الصعبة والشراكات والأشخاص الذين يقفون خلف كل شركة. أُنشئت Arabs Startups لتوثيق هذه الصورة كاملةً."),
		p("تبدأ تغطيتنا من منظومة الشركات الناشئة في سوريا: الشركات التي تُبنى، والمؤسّسون الذين يخوضون المخاطرة، والمستثمرون والداعمون الذين يفتحون الأبواب، والبرامج التي تحوّل الأفكار إلى أعمال حقيقية. ومن خلال الأخبار والمقالات والحوارات والندوات والبودكاست، نحوّل المعلومات المتناثرة إلى مصدر إعلامي مفيد."),
		p("نؤمن بالتغطية العملية، والمصادر الشفافة، وتعدّد وجهات النظر، وإتاحة المجال للمؤسّسين كي يرووا تجربتهم بأصواتهم. نبني الثقة مع الوقت عبر الاستمرارية والفضول والإنصاف، أيًّا كانت الحاضنة أو المسرّعة أو الجهة المعنيّة."),
		h2("رسالتنا"),
		p("أن نربط مجتمع الشركات الناشئة ونُعلمه ونُلهمه عبر صحافة عربية موثوقة، وحوارات مع المؤسّسين، ورؤى عملية في ريادة الأعمال."),
		h2("رؤيتنا"),
		p("أن نصبح مرجعًا موثوقًا لتغطية ريادة الأعمال في سوريا، وصوتًا معترفًا به لمنظومة الشركات الناشئة في المنطقة العربية."),
		h2("استقلاليتنا"),
		p("Arabs Startups علامة إعلامية مستقلّة. نُميّز بوضوح بين التقارير المستقلّة والرأي والمحتوى المدعوم والبيانات الصحفية."),
	]),
	page("page-about-en", "about", "About us", [
		p("Entrepreneurship is not only about successful fundraising announcements and impressive launch stories. It is also about the experiments, setbacks, difficult decisions, partnerships and determined people behind every company. Arabs Startups was created to document that complete picture."),
		p("Our coverage starts with the Syrian startup ecosystem. Through news, articles, founder interviews, webinars and podcasts, we turn scattered information into an accessible media resource."),
		h2("Our mission"),
		p("To connect, inform and inspire the startup community through credible Arabic-language journalism, founder conversations and useful insights into entrepreneurship."),
		h2("Independence"),
		p("Arabs Startups is an independent media brand. We clearly label opinion, sponsored content and press releases so readers can tell them apart from independent reporting."),
	], { locale: "en", translationOf: "page-about" }),
	page("page-submit", "submit-news", "أرسل خبرًا أو قصة", [
		p("نرحّب بأخبار الشركات الناشئة، وقصص المؤسّسين، وإعلانات الفعاليات، ومقترحات التعاون الإعلامي."),
		h2("ما الذي يحدث بعد الإرسال"),
		li("الإرسال لا يضمن النشر. يراجع الفريق التحريري كل طلب."),
		li("نطلب مصادر يمكن التحقّق منها لكل خبر أو رقم."),
		li("إذا قُبل محتوى مدعوم أو مدفوع فسيُوسَم بوضوح."),
		li("لا نَعِد بمدّة محدّدة للردّ."),
	]),
	page("page-privacy", "privacy", "سياسة الخصوصية", [
		quote(DRAFT_LEGAL_AR),
		p("نجمع الحدّ الأدنى من البيانات اللازمة لتشغيل التعليقات ونموذج التواصل."),
		h2("ما الذي نجمعه"),
		li("التعليقات: الاسم المعروض، والبريد الإلكتروني (لا يُنشر أبدًا)، ونصّ التعليق."),
		li("نموذج التواصل: الاسم، والبريد، والموضوع، والرسالة، والمؤسّسة اختياريًا."),
		li("لحماية الموقع من الإساءة نحفظ بصمة مشفّرة لعنوان IP، لا العنوان نفسه."),
		h2("لماذا نجمعه"),
		p("لمراجعة التعليقات قبل نشرها، والردّ على رسائلك، ومنع الرسائل المزعجة. لا نبيع البيانات ولا نضيفك إلى أي قائمة بريدية دون موافقتك."),
		h2("مدة الاحتفاظ"),
		p("تُحذف رسائل نموذج التواصل تلقائيًا بعد مدّة الاحتفاظ المحدّدة. يمكنك طلب الاطلاع على بياناتك أو حذفها عبر صفحة «اتصل بنا»."),
		h2("ملفات تعريف الارتباط"),
		p("لا نستخدم ملفات تعريف ارتباط إعلانية. تُستخدم ملفات ضرورية فقط لتسجيل دخول فريق التحرير ولحماية النماذج من الروبوتات."),
	]),
	page("page-privacy-en", "privacy", "Privacy policy", [
		quote(DRAFT_LEGAL_EN),
		p("We collect the minimum data needed to run comments and the contact form. Commenter emails are never published. To prevent abuse we store a one-way hash of your IP address, not the address itself. Contact messages are deleted automatically after the retention period. You can ask to see or delete your data through the contact page."),
	], { locale: "en", translationOf: "page-privacy" }),
	page("page-terms", "terms", "شروط الاستخدام", [
		quote(DRAFT_LEGAL_AR),
		p("باستخدامك الموقع فأنت توافق على استخدام المحتوى لأغراض مشروعة، واحترام حقوق الملكية الفكرية، وعدم إساءة استخدام خدمات التعليق والتواصل."),
	]),
	page("page-terms-en", "terms", "Terms of use", [
		quote(DRAFT_LEGAL_EN),
		p("By using this site you agree to use its content lawfully, respect intellectual property and not misuse the comment and contact services."),
	], { locale: "en", translationOf: "page-terms" }),
	page("page-editorial", "editorial-policy", "السياسة التحريرية", [
		quote(DRAFT_LEGAL_AR),
		li("نتحقّق من التواريخ والأرقام وأسماء المستثمرين والمشاركين من مصادر أوّلية أو مؤكّدة مستقلّة."),
		li("ننسب المعلومات إلى مصادرها، ولا ننسخ مقالات الآخرين."),
		li("نوسم الرأي والمحتوى المدعوم والبيانات الصحفية بوضوح."),
		li("لا نغطّي الشأن السياسي؛ تركيزنا ريادة الأعمال والابتكار والاقتصاد المرتبط بهما."),
		li("نحصل على موافقة الضيوف على الحوارات المسجّلة وعلى حقوق الصور والوسائط."),
		li("نغطّي المنظومة كلّها بإنصاف، بصرف النظر عن أي مستثمر أو حاضنة أو مسرّعة."),
	]),
	page("page-editorial-en", "editorial-policy", "Editorial policy", [
		quote(DRAFT_LEGAL_EN),
		li("We verify dates, figures, investors and participant names with primary or independently confirmed sources."),
		li("We credit sources and never copy other publishers' articles."),
		li("Opinion, sponsored content and press releases are clearly labelled."),
		li("We do not cover politics; we focus on entrepreneurship, innovation and related economic developments."),
	], { locale: "en", translationOf: "page-editorial" }),
	page("page-corrections", "corrections", "سياسة التصحيحات", [
		quote(DRAFT_LEGAL_AR),
		p("نصحّح الأخطاء بشفافية، ونذكر التصحيح الجوهري وتاريخه في أسفل المقال المعنيّ. لطلب تصحيح، استخدم صفحة «اتصل بنا» واختر «تصحيح»."),
	]),
	page("page-corrections-en", "corrections", "Corrections policy", [
		quote(DRAFT_LEGAL_EN),
		p("We correct mistakes openly and note significant corrections, with their date, at the end of the article. To request a correction, use the contact page and choose “Correction”."),
	], { locale: "en", translationOf: "page-corrections" }),
	page("page-disclosure", "disclosure", "الإفصاح عن الرعاية والملكية", [
		quote(DRAFT_LEGAL_AR),
		p("نُميّز بوضوح المحتوى المدعوم والبيانات الصحفية عن التقارير المستقلّة. يحمل كل محتوى مدعوم وسمًا ظاهرًا."),
		p("يُنشر بيان الملكية القانونية بعد استكمال التحقّق منه."),
	]),
	page("page-disclosure-en", "disclosure", "Sponsorship and ownership disclosure", [
		quote(DRAFT_LEGAL_EN),
		p("Sponsored content and press releases are always clearly labelled. A legal ownership statement will be published once verified."),
	], { locale: "en", translationOf: "page-disclosure" }),
	page("page-comment-policy", "comment-policy", "سياسة التعليقات", [
		p("نرحّب بالتعليقات المحترمة وذات الصلة. تُراجَع كل التعليقات قبل نشرها."),
		li("لا تحرّش ولا تشهير ولا ادّعاءات مختلَقة."),
		li("لا رسائل مزعجة ولا ترويج غير مطلوب."),
		li("لا تنشر بيانات شخصية لأي شخص."),
		li("قد يردّ المحرّرون علنًا، ويظهر ردّهم بوسم «فريق التحرير»."),
		p("بريدك الإلكتروني لا يُنشر أبدًا. يظهر تنبيه واضح عندما يكون تعليقك بانتظار المراجعة."),
	]),
	page("page-comment-policy-en", "comment-policy", "Comment policy", [
		p("We welcome respectful, relevant comments. Every comment is reviewed before it is published. No harassment, defamation, spam, unsolicited promotion or disclosure of anyone's personal information. Editors may reply publicly; their replies carry an “Editorial team” badge. Your email address is never published."),
	], { locale: "en", translationOf: "page-comment-policy" }),
];

const seed = {
	$schema: "https://emdashcms.com/seed.schema.json",
	version: "1",
	meta: {
		name: "Arabs Startups",
		description: "Arabic-first startup and entrepreneurship media site.",
		author: "Arabs Startups",
	},
	settings: {
		title: "Arabs Startups",
		tagline: "قصص الشركات الناشئة وروّاد الأعمال العرب",
	},
	collections: [
		{
			slug: "posts",
			label: "المقالات",
			labelSingular: "مقال",
			urlPattern: "/articles/{slug}",
			supports: ["drafts", "revisions", "preview", "scheduling", "search", "seo"],
			commentsEnabled: true,
			sortOrder: 1,
			fields: [
				{ slug: "title", label: "العنوان", type: "string", required: true, searchable: true },
				{ slug: "excerpt", label: "الملخّص", type: "text", searchable: true },
				{ slug: "featured_image", label: "صورة الغلاف (مرخّصة فقط)", type: "image" },
				{ slug: "content", label: "النص", type: "portableText", searchable: true },
				{
					slug: "content_label",
					label: "نوع المحتوى",
					type: "select",
					required: true,
					defaultValue: "news",
					translatable: false,
					validation: { options: ["news", "analysis", "interview", "opinion", "partner", "sponsored", "press_release"] },
				},
				{
					slug: "editorial_status",
					label: "حالة المراجعة التحريرية",
					type: "select",
					defaultValue: "writing",
					translatable: false,
					validation: { options: ["writing", "in_review", "approved"] },
				},
				{ slug: "source_name", label: "اسم المصدر", type: "string" },
				{ slug: "source_url", label: "رابط المصدر", type: "url" },
				{ slug: "corrections", label: "التصحيحات (تظهر للقرّاء)", type: "text" },
				{ slug: "sample_content", label: "محتوى نموذجي (يُستبدل قبل الإطلاق)", type: "boolean", defaultValue: false, translatable: false },
			],
		},
		{
			slug: "episodes",
			label: "الندوات والبودكاست",
			labelSingular: "حلقة",
			urlPattern: "/episodes/{slug}",
			supports: ["drafts", "revisions", "preview", "scheduling", "search", "seo"],
			sortOrder: 2,
			fields: [
				{ slug: "title", label: "العنوان", type: "string", required: true, searchable: true },
				{ slug: "excerpt", label: "الوصف", type: "text", searchable: true },
				{
					slug: "episode_type",
					label: "النوع",
					type: "select",
					required: true,
					defaultValue: "webinar",
					translatable: false,
					validation: { options: ["webinar", "podcast", "video"] },
				},
				{ slug: "recorded_at", label: "تاريخ التسجيل", type: "datetime" },
				{ slug: "guests", label: "الضيوف (بموافقتهم)", type: "string", searchable: true },
				{ slug: "media_url", label: "رابط الحلقة (YouTube / Spotify / LinkedIn …)", type: "url", required: true, translatable: false },
				{ slug: "featured_image", label: "صورة (مرخّصة فقط)", type: "image" },
				{ slug: "transcript", label: "النص المكتوب / الملاحظات", type: "portableText", searchable: true },
			],
		},
		{
			slug: "pages",
			label: "الصفحات",
			labelSingular: "صفحة",
			urlPattern: "/{slug}",
			supports: ["drafts", "revisions", "preview", "search", "seo"],
			sortOrder: 3,
			fields: [
				{ slug: "title", label: "العنوان", type: "string", required: true, searchable: true },
				{ slug: "content", label: "النص", type: "portableText", searchable: true },
			],
		},
	],
	taxonomies: [
		{
			id: "tax-category-ar",
			name: "category",
			label: "الأقسام",
			labelSingular: "قسم",
			hierarchical: true,
			collections: ["posts"],
			terms: [
				{ id: "cat-news", slug: "news", label: "الأخبار" },
				{ id: "cat-founders", slug: "founder-stories", label: "قصص المؤسّسين" },
				{ id: "cat-failure", slug: "lessons-from-failure", label: "دروس من الإخفاق" },
				{ id: "cat-women", slug: "women-in-entrepreneurship", label: "نساء في ريادة الأعمال" },
				{ id: "cat-opinion", slug: "opinion", label: "رأي" },
			],
		},
		{
			id: "tax-category-en",
			name: "category",
			label: "Sections",
			labelSingular: "Section",
			locale: "en",
			translationOf: "tax-category-ar",
			terms: [
				{ slug: "news", label: "News", locale: "en", translationOf: "cat-news" },
				{ slug: "founder-stories", label: "Founder Stories", locale: "en", translationOf: "cat-founders" },
				{ slug: "lessons-from-failure", label: "Lessons From Failure", locale: "en", translationOf: "cat-failure" },
				{ slug: "women-in-entrepreneurship", label: "Women in Entrepreneurship", locale: "en", translationOf: "cat-women" },
				{ slug: "opinion", label: "Opinion", locale: "en", translationOf: "cat-opinion" },
			],
		},
		{
			id: "tax-tag-ar",
			name: "tag",
			label: "الوسوم",
			labelSingular: "وسم",
			hierarchical: false,
			collections: ["posts"],
			terms: [
				{ id: "tag-about", slug: "about-us", label: "عن المنصّة" },
				{ id: "tag-founders", slug: "founders", label: "مؤسّسون" },
				{ id: "tag-process", slug: "editorial-process", label: "منهجيتنا" },
				{ id: "tag-contributors", slug: "contributors", label: "للمساهمين" },
			],
		},
	],
	bylines: [{ id: "byline-editorial", slug: "editorial-team", displayName: "فريق تحرير Arabs Startups" }],
	content: { posts, pages },
};

// Arabic is the default locale: say so explicitly on every untagged entry,
// so no tool can mistake it for another language.
for (const entry of [...posts, ...pages]) entry.locale ??= "ar";
for (const taxonomy of seed.taxonomies) {
	taxonomy.locale ??= "ar";
	for (const term of taxonomy.terms ?? []) term.locale ??= taxonomy.locale;
}

writeFileSync(new URL("../seed/seed.json", import.meta.url), `${JSON.stringify(seed, null, "\t")}\n`);
console.log(`seed/seed.json written: ${posts.length} posts, ${pages.length} pages`);
