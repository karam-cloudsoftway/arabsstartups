# arabs/startups

Arabic-first media site for startups and founders, starting with Syria and
growing across the Arab region. Built on Astro 7 and the EmDash CMS, running on
Cloudflare Workers with D1, R2, Cloudflare Access (staff sign-in by emailed
one-time PIN) and Turnstile.

## What is included

- Public site in Arabic (right-to-left) with an English edition under `/en`:
  home, news, founder stories, webinars & podcasts (shown once an episode is
  published), article pages, CMS pages (about, policies), search, RSS, sitemap,
  404, dark mode, mobile-first layout, SEO tags and JSON-LD.
- Comments: moderated before publication, editorial replies with an
  "Editorial team" badge, server-side spam protection.
- Contact form → private newsroom inbox (status, assignment, internal notes,
  email reply, CSV export for Admins, delete, retention).
- Staff newsroom at `/newsroom`: inbox, comment moderation and replies, audit
  log, team page, opt-in alerts. Content is written and published in the EmDash
  admin at `/_emdash/admin`.
- Security: origin-side Access verification, strict CSP and headers, rate
  limits, audit trail. See [docs/SECURITY.md](docs/SECURITY.md).

## Run it locally

```bash
npm ci
cp .env.example .env && npm run secrets:generate -- --write=.env
npm run dev
```

Then open `http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/` once
to load the starter content. Local staff login for testing:
`http://localhost:4321/dev/login?role=editor&next=/newsroom`
(roles: contributor, author, editor, admin). These helpers do not exist in
production builds.

## Tests

```bash
npm run lint               # code quality, accessibility and project rules
npm run typecheck          # 0 errors expected
npm test                   # unit tests
npm run test:e2e           # browser tests (desktop + mobile)
npm run test:prod          # production-build security tests (stop `npm run dev` first)
```

GitHub Actions runs all of these on every pull request, plus secret, workflow
and static-analysis scans: [docs/CI_CD.md](docs/CI_CD.md).

## Deploy

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for the one-time Cloudflare setup,
[docs/CI_CD.md](docs/CI_CD.md) for GitHub setup and deploys from Actions, and
[docs/OPERATIONS.md](docs/OPERATIONS.md) for staff changes, backups and
incidents. From a laptop: `npm run deploy:staging`, then `npm run deploy:production`.

## Project docs

- [BUILD_PLAN.md](BUILD_PLAN.md) — the plan and its status
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it fits together
- [AGENTS.md](AGENTS.md) — rules for coding agents
- `design/` — content brief, technical spec, brand (Slash)
- `design-system/arabs-startups/MASTER.md` — design tokens and rules
