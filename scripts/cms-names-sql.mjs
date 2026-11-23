#!/usr/bin/env node
/**
 * Prints SQL that brings an EXISTING database in line with scripts/cms-names.mjs:
 * bilingual list, field and taxonomy names, readable dropdown values (stored
 * rows and draft revisions included), the English Tags taxonomy and the CMS
 * tagline. Safe to run twice. Back up first (D1 Time Travel bookmark).
 *
 *   node scripts/cms-names-sql.mjs > cms-names.sql
 *   npx wrangler d1 execute arabsstartups-prod --remote --env production --file cms-names.sql
 *
 * Values come only from our own constants; each one is quoted below.
 */
import { COLLECTIONS, FIELD_LABELS, OPTIONS, SITE_TAGLINE_AR, TAXONOMIES } from "./cms-names.mjs";

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => q(JSON.stringify(value));
const out = [];
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const collectionId = (slug) => `(SELECT id FROM _emdash_collections WHERE slug = ${q(slug)})`;

for (const [slug, names] of Object.entries(COLLECTIONS)) {
	out.push(
		`UPDATE _emdash_collections SET label = ${q(names.label)}, label_singular = ${q(names.labelSingular)}, description = ${q(names.description)}, updated_at = ${now} WHERE slug = ${q(slug)};`,
	);
}
for (const [collection, fields] of Object.entries(FIELD_LABELS)) {
	for (const [slug, label] of Object.entries(fields)) {
		out.push(`UPDATE _emdash_fields SET label = ${q(label)} WHERE collection_id = ${collectionId(collection)} AND slug = ${q(slug)};`);
	}
}

const selects = [
	{ collection: "posts", table: "ec_posts", field: "content_label", map: OPTIONS.contentType, fallback: "news" },
	{ collection: "posts", table: "ec_posts", field: "editorial_status", map: OPTIONS.editorialStatus, fallback: "writing" },
	{ collection: "episodes", table: "ec_episodes", field: "episode_type", map: OPTIONS.episodeType, fallback: "webinar" },
];
for (const { collection, table, field, map, fallback } of selects) {
	out.push(
		`UPDATE _emdash_fields SET validation = ${json({ options: Object.values(map) })}, default_value = ${json(map[fallback])} WHERE collection_id = ${collectionId(collection)} AND slug = ${q(field)};`,
	);
	for (const [key, label] of Object.entries(map)) {
		out.push(`UPDATE ${table} SET ${field} = ${q(label)} WHERE ${field} = ${q(key)};`);
		out.push(
			`UPDATE revisions SET data = json_set(data, '$.${field}', ${q(label)}) WHERE collection = ${q(collection)} AND json_valid(data) AND json_extract(data, '$.${field}') = ${q(key)};`,
		);
	}
}

for (const [name, locales] of Object.entries(TAXONOMIES)) {
	for (const [locale, names] of Object.entries(locales)) {
		out.push(
			`UPDATE _emdash_taxonomy_defs SET label = ${q(names.label)}, label_singular = ${q(names.labelSingular)} WHERE name = ${q(name)} AND locale = ${q(locale)};`,
		);
	}
}
// The English edition had no Tags taxonomy: add it, linked to the Arabic one.
out.push(
	`INSERT INTO _emdash_taxonomy_defs (id, name, label, label_singular, hierarchical, collections, created_at, locale, translation_group)
SELECT 'taxdef_tag_en', 'tag', ${q(TAXONOMIES.tag.en.label)}, ${q(TAXONOMIES.tag.en.labelSingular)}, 0, '["posts"]', datetime('now'), 'en', translation_group
FROM _emdash_taxonomy_defs WHERE name = 'tag' AND locale = 'ar'
AND NOT EXISTS (SELECT 1 FROM _emdash_taxonomy_defs WHERE name = 'tag' AND locale = 'en');`,
);

for (const name of ["site:tagline", "emdash:site_tagline"]) {
	out.push(`UPDATE options SET value = ${json(SITE_TAGLINE_AR)} WHERE name = ${q(name)};`);
}

console.log(out.join("\n"));
