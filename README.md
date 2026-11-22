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

There is one environment: production (`arabsstartups.com`). Every deploy goes
straight to the live site. You can deploy from your machine (below, the
recommended way) or from GitHub Actions ([docs/CI_CD.md](docs/CI_CD.md)).
[docs/RUNBOOK.md](docs/RUNBOOK.md) covers the one-time Cloudflare setup and
[docs/OPERATIONS.md](docs/OPERATIONS.md) covers staff changes, backups and
incidents.

### Deploy from your machine

#### Once per machine

1. Finish the Cloudflare setup in [docs/RUNBOOK.md](docs/RUNBOOK.md) §0–5
   (database, storage, Turnstile, Access, secrets). The very first deploy is
   RUNBOOK §6.
2. Install Node 24 (the version in `.node-version`), then check it:
   `node --version`.
3. Sign in to Cloudflare. A browser window opens; choose **Allow**.

   ```bash
   npx wrangler login
   npx wrangler whoami     # must show the Arabs Startups account
   ```

   If `whoami` shows more than one account, the deploy asks which one to use.
   Pick the Arabs Startups account.

#### Every deploy

1. Start from the latest `main`, with nothing uncommitted. The build uses the
   files on disk, so uncommitted changes would go live without review.

   ```bash
   git switch main
   git pull --ff-only
   git status --short      # must print nothing
   ```

2. Check that GitHub Actions is green for this commit: the
   **All checks passed** check on the latest `main` run. Do not deploy a red
   commit.
3. Install the exact package versions and run the quick checks:

   ```bash
   npm ci
   npm run lint && npm run typecheck && npm test
   ```

4. If this release adds a database migration (a new entry in
   `src/lib/db/migrations.ts`), write down the current time in UTC first
   (`date -u +%Y-%m-%dT%H:%M:%SZ`). The migration runs on the first visit
   after the deploy, and a code rollback does not undo it. With that time you
   can restore the database (see "If something goes wrong").
5. Build, run the safety checks and deploy, all in one command:

   ```bash
   npm run deploy:production
   ```

   It builds with the production settings, then `scripts/predeploy.mjs`
   removes local secrets from the build and stops the deploy if it finds
   placeholders, Turnstile test keys or a missing database id. Only then does
   `wrangler deploy` upload the site.
6. Check the live site. This takes about a minute:

   ```bash
   npm run smoke
   ```

   It checks that the site answers, sends its security headers, and that the
   CMS admin, the newsroom and the dev helpers are closed to visitors. Every
   line must show ✔.

#### If something goes wrong

| What you see | What to do |
|---|---|
| The smoke test fails, or the site is broken after the deploy | Roll back to the previous version: `npx wrangler rollback --name arabsstartups`. Or: Cloudflare → Workers & Pages → `arabsstartups` → Deployments → Rollback. |
| The smoke test says **CMS admin is closed ✖ 200** | The CMS is open to the internet. Roll back first, then fix the Access application (RUNBOOK §4). |
| A migration damaged data | Roll back the code, then restore the database to the time from step 4: `npx wrangler d1 time-travel restore arabsstartups-prod --timestamp=<time>` ([docs/OPERATIONS.md](docs/OPERATIONS.md) → Backups and restore). |
| `predeploy: ... CHANGE-ME`, `has no database_id` or `TEST key` | The Cloudflare setup is not finished: RUNBOOK §2–3. Nothing was deployed. |
| `Authentication error [code: 10000]` or `Not logged in` | Run `npx wrangler login` again and check `npx wrangler whoami`. |
| `npm ci` says the lockfile is out of sync | Your Node version is wrong. Use Node 24, then run `npm ci` again. |

## Project docs

- [BUILD_PLAN.md](BUILD_PLAN.md) — the plan and its status
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it fits together
- [AGENTS.md](AGENTS.md) — rules for coding agents
- `design/` — content brief, technical spec, brand (Slash)
- `design-system/arabs-startups/MASTER.md` — design tokens and rules
