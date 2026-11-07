# Architecture

## Stack

| Layer | Choice |
|---|---|
| Site and routes | Astro 7 (server output) + TypeScript, Arabic default (`/`), English under `/en` |
| CMS | EmDash 1.4 (admin at `/_emdash/admin`), audit-log plugin for content changes |
| Hosting | Cloudflare Workers (`src/worker.ts`), Cron Trigger every minute |
| Data | Cloudflare D1 (EmDash tables + our `as_*` tables), R2 for media |
| Staff sign-in | Cloudflare Access, email one-time PIN |
| Spam protection | Cloudflare Turnstile, verified on the server |
| Email | Resend (optional); dev outbox locally |

## Code map

```
src/
  middleware/outer.ts      runs first: Access gate, comment-write block, headers
  lib/security/            access-jwt, turnstile, origin, rate-limit, text, headers, paths, hash
  lib/staff/               roles (permission table), guard (THE access rule), forms, deny
  lib/comments/            policy (schemas), service (visitor comments, staff replies)
  lib/inbox/               validation, repo, csv, labels
  lib/audit/               log, roster (staff-change detection)
  lib/email/               send, alerts, templates
  lib/content/             queries, listing, routes (locale pairs), embeds
  lib/db/                  sql interface, migrations (append-only), settings
  lib/runtime.ts           request wiring (bindings, db, requireStaff)
  i18n/                    ar.ts, en.ts, helpers
  views/                   page bodies shared by Arabic and English routes
  pages/                   routes; pages/en mirrors; pages/newsroom staff area
seed/seed.json             CMS schema + starter content (built by scripts/build-seed.mjs)
tests/unit                 Vitest, real SQLite via node:sqlite
tests/e2e                  Playwright against `astro dev`
tests/prod                 Playwright against the production build (`astro preview`)
```

## Request flows

- **Public page:** EmDash query helpers → published entries only (drafts only on
  EmDash's signed preview links).
- **Comment:** form → `POST /api/comments` → origin, size, schema, honeypot,
  Turnstile, rate limits, published+open article, valid parent, duplicate check
  → stored `pending` via EmDash's `CommentRepository`. Editors approve in
  `/newsroom/comments` or the CMS; replies are stored `approved`, linked to the
  staff account and audited.
- **Contact:** form → `POST /api/contact` → same checks → `as_inquiries` →
  opt-in staff alert with a link only.
- **Newsroom:** every page calls `requireStaff(scope, permission)`. In
  production the identity is the Access JWT verified on that request; locally it
  is the EmDash session. The EmDash `users` row is re-read every time.
- **Cron:** EmDash scheduled publishing, then `runMaintenance()`: staff-change
  audit every 5 minutes; hourly rate-limit cleanup and inbox retention.

## Decisions

1. **Gateway instead of an Access bypass for comments.** `/_emdash/*` stays
   fully behind Access; the only public write path is our validated
   `/api/comments` (spec §4 preferred option).
2. **Own staff area (`/newsroom`).** Contact inbox, comment replies, audit and
   team pages live in our code with one access rule, Arabic UI, and full tests.
   Content, media, users and settings stay in the EmDash admin.
3. **Visitor comments are always pending**, independent of EmDash's per-collection
   moderation setting.
4. **Origin-side Access verification** in addition to the edge policy, so a
   misconfigured policy fails closed.
5. **Own tables are prefixed `as_` and migrated append-only** (never edit a
   shipped migration).
