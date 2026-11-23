#!/usr/bin/env node
/**
 * Prints SQL that removes the old "draft awaiting review" notices from CMS
 * pages already in a database (live pages and their saved revisions).
 * (instr(), not LIKE: D1 refuses long LIKE patterns.)
 * Only whole text blocks that exactly match a line below are removed.
 * Safe to run twice. Back up first (D1 Time Travel bookmark).
 *
 *   node scripts/remove-draft-notices-sql.mjs > notices.sql
 *   npx wrangler d1 execute arabsstartups-prod --remote --env production --file notices.sql
 */
const LINES = [
	"مسودة أولية بانتظار المراجعة القانونية والتحريرية قبل الإطلاق.",
	"Initial draft awaiting legal and editorial review before launch.",
	"يُنشر بيان الملكية القانونية بعد استكمال التحقّق منه.",
];
const SENTENCE_EN = " A legal ownership statement will be published once verified.";

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const list = LINES.map(q).join(", ");
const keep = (source) =>
	`(SELECT json_group_array(json(value)) FROM (SELECT value FROM json_each(${source}) WHERE COALESCE(json_extract(value, '$.children[0].text'), '') NOT IN (${list}) ORDER BY key))`;
const touches = (column) => LINES.map((line) => `instr(${column}, ${q(line)}) > 0`).join(" OR ");

const out = [
	`UPDATE ec_pages SET content = ${keep("ec_pages.content")} WHERE json_valid(content) AND (${touches("content")});`,
	`UPDATE ec_pages SET content = replace(content, ${q(SENTENCE_EN)}, '') WHERE instr(content, ${q(SENTENCE_EN)}) > 0;`,
	`UPDATE revisions SET data = json_set(data, '$.content', json(${keep("revisions.data, '$.content'")})) WHERE collection = 'pages' AND json_valid(data) AND json_type(data, '$.content') = 'array' AND (${touches("data")});`,
	`UPDATE revisions SET data = replace(data, ${q(SENTENCE_EN)}, '') WHERE collection = 'pages' AND instr(data, ${q(SENTENCE_EN)}) > 0;`,
];
console.log(out.join("\n"));
