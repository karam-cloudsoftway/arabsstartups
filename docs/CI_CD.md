# CI/CD pipeline: review, setup and daily use

This document covers the GitHub Actions pipeline in `.github/workflows/ci.yml`:
what it checks, what the review changed, how to set everything up before the
first run, and how to deploy and roll back.

Do the Cloudflare setup in [RUNBOOK.md](RUNBOOK.md) first. The pipeline cannot
deploy until that is done.

---

## 1. What the pipeline does

```
Pull request · push to main · every Monday 03:17 UTC
 ├─ quality ........ lockfile sources · npm audit · registry signatures
 │                   lint (quality, accessibility, project rules) · type check
 │                   unit tests · seed file in sync
 ├─ security ....... gitleaks secret scan of the whole git history
 │                   actionlint + shellcheck · zizmor workflow security audit
 ├─ sast ........... Semgrep: JavaScript, TypeScript, Node.js and secrets rules
 └─ browser-tests .. Playwright on desktop and mobile · production-build boundary tests

Manual run (Actions → CI → Run workflow → deploy: staging | production)
 └─ deploy ......... starts only after all four jobs pass on the same commit
                     production allowed from main only → npm ci → build
                     → predeploy safety checks → wrangler deploy (only this step
                     sees the Cloudflare token) → smoke test of the live site
                     → summary with the rollback command
```

| Job | Fails when |
|---|---|
| Code quality and dependencies | a package comes from outside the npm registry or has no integrity hash; a known vulnerability (moderate or worse in site packages, high or worse in tooling); a registry signature is invalid; any lint warning; a type error; a failing unit test; `seed/seed.json` differs from its generator |
| Secrets and workflow security | a secret anywhere in git history; a broken or unsafe workflow (unpinned action, script injection, leaked credentials, excessive permissions) |
| Static analysis (Semgrep) | a risky code pattern or a hard-coded secret |
| Browser and production-build tests | any public, comment, contact, access or episode test fails; the production build exposes the CMS, newsroom or dev helpers, or breaks the CSP |
| Deploy | the target or branch is wrong; predeploy finds placeholders, test keys, a missing database id or preview URLs; the deploy fails; the live site fails a smoke check |

The smoke test (`scripts/smoke-test.mjs`) checks the live site after each
deploy: `/healthz` answers, the home page sends its security headers, and
`/_emdash/admin`, the CMS API, the dev setup bypass and `/newsroom` are all
closed to a visitor who is not signed in. `/dev/login` must answer 404.

---

## 2. Review findings and fixes

Measured on the previous workflow, then on the new one:

| Check | Before | After |
|---|---|---|
| zizmor (workflow security) | 7 findings: 5 high (unpinned actions), 2 medium (credentials left on disk) | 0 |
| actionlint + shellcheck | 0 | 0 |
| gitleaks (history + working tree) | not run | 0 leaks |
| Semgrep (111 rules, 138 files) | not run | 0 findings |
| ESLint (new) | not run | 0 problems after fixing 14 |
| `npm audit` | 0 | 0 (with the new lint packages) |

| # | Finding in the previous pipeline | Risk | Fix |
|---|---|---|---|
| 1 | Actions referenced by tag (`@v4`) | A moved or hijacked tag runs new code in your pipeline | Every action pinned to a full commit SHA; Dependabot keeps them current |
| 2 | Checkout left the GitHub token on disk | Any later step, including a package install script, could read it | `persist-credentials: false` everywhere |
| 3 | The Cloudflare token was present during the whole build | Every build dependency could read it | Build and checks run first; only the final `wrangler deploy` step gets the token |
| 4 | Production could be deployed from any branch | Unreviewed code could reach production | Branch check in the job, plus a `main`-only rule on the GitHub environment |
| 5 | One shared concurrency group with cancel-in-progress | A push to main could cancel a deploy halfway | Runs grouped by trigger; only stale pull-request runs are cancelled; deploys queue per target |
| 6 | Only a type check for code quality | Bugs, accessibility problems and broken project rules go unnoticed | ESLint with TypeScript, Astro and accessibility rules, plus three AGENTS.md rules enforced in code: no secrets via `import.meta.env`, no inline `<script>`, no values interpolated into SQL |
| 7 | Only `npm audit` (high) for security | Secrets in git, unsafe workflows, risky code and tampered packages go unnoticed | gitleaks, actionlint, zizmor, Semgrep, lockfile source check, registry signature check, and a stricter audit level for site packages |
| 8 | No dependency update automation | Fixes arrive late | Dependabot for npm and Actions, with a cooldown so brand-new releases wait a few days |
| 9 | No check after deploying | A broken or exposed site could stay live unnoticed | Smoke test, including "private areas are closed" |
| 10 | Floating runner image and Node version | Surprise breakage when GitHub changes defaults | `ubuntu-24.04` and `.node-version` (24) |
| 11 | No timeout on the deploy job; package cache used in the privileged job | Hung runs; a poisoned cache could reach the job holding the token | Timeouts on every job; no cache in the deploy job |
| 12 | Playwright could skip tests silently | A stray `test.only` passes CI; the production suite could test a running dev server | `forbidOnly` in CI; the production suite never reuses a server |
| 13 | Comment promised "required reviewers" | Not available for private repositories below GitHub Enterprise | Plan options explained in section 3 |
| 14 | A deploy without database ids could create a new, empty database | Production would start with no content | `predeploy.mjs` now requires `database_id` and `preview_urls: false` |

Code changes made while fixing lint findings:

- `src/components/Comments.astro`, `src/components/ContactForm.astro`: the
  form script is now loaded with `<script src="...">`. Astro still bundles it
  as an external file, and the CSP rule is now checked by lint.
- `src/lib/staff/guard.ts`, `src/lib/content/embeds.ts`: removed unused initial values.
- Five SQL statements build their `WHERE` clause or table name from fixed
  text. Each now carries a comment explaining why it is safe; values stay bound.
- `package.json`: an override pins `minimatch` to `11.0.3`. It fixes advisory
  GHSA-g3hv-75wg-m249, which reached us through the new lint packages.
- `wrangler.jsonc`: `preview_urls: false` for staging and production, so each
  environment has exactly one public address.

---

## 3. Before you start: pick the GitHub plan

GitHub's free plan does not protect private repositories. This table decides
how strong the deploy protection can be.

| Setup | Cost | Rules on `main` | Deploy token limited to `main` | Approval before production | GitHub secret and code scanning |
|---|---|---|---|---|---|
| Free, **public** repo | $0 | yes | yes | yes | yes, free |
| Free, private repo | $0 | no | no | no | no (the pipeline's own scanners still run) |
| Team, private repo | $4 per user per month | yes | yes | no | paid add-on |
| Enterprise Cloud, private repo | from $21 per user per month | yes | yes | yes | paid add-on |

Sources: [environments](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment),
[rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[Advanced Security on public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security),
[plans](https://github.com/pricing).

**Recommendation.**

- If the code may be public: **Free + public repository**. It gives every
  protection below at no cost. The code holds no secrets, and the site's
  security does not depend on hiding it.
- If the code must stay private: **Team**, so `main` is protected and the
  deploy token only reaches jobs running on `main`.
- On **Free + private**, do not store a production token in GitHub. Let CI run
  the checks, and deploy production from the owner's laptop
  (`npm run deploy:production`, signed in with `npx wrangler login`).

**A decision for the owner.** Plan §7 says secrets live only in Cloudflare,
never in GitHub. Deploying from GitHub needs one Cloudflare deploy token stored
in GitHub. Choose one:

- **A. Allow one exception:** a deploy token stored as an environment secret
  that only `main` can use (needs a public repository or Team). It cannot read
  the site's secrets directly, but it can deploy code, so treat it as full
  control of the live site.
- **B. Keep the rule as written:** CI runs every check; people deploy from a
  trusted laptop. Skip steps 7–8 below and never choose a deploy target in CI.

---

## 4. Step-by-step setup

### Step 1. Finish the Cloudflare setup

Follow [RUNBOOK.md](RUNBOOK.md) sections 0–4. Before going on, all of these must be true:

| Check | Where |
|---|---|
| D1 databases and R2 buckets exist; each `database_id` is in `wrangler.jsonc` | RUNBOOK §1 |
| `PUBLIC_TURNSTILE_SITE_KEY` is the real site key (staging and production) | RUNBOOK §2 |
| Staging hostname replaces `CHANGE-ME` in `EMDASH_SITE_URL` and `TURNSTILE_ALLOWED_HOSTNAMES` | `wrangler.jsonc` → `env.staging.vars` |
| `CF_ACCESS_TEAM_DOMAIN` matches your Zero Trust team name | `wrangler.jsonc`, both environments |
| Access protects production **and** staging, each with its own audience tag | RUNBOOK §3 |
| Worker secrets are set for each environment | RUNBOOK §4 |
| `npm run build:staging && node scripts/predeploy.mjs staging` passes on your laptop | terminal |

### Step 2. First deploy from the owner's laptop

The first deploy creates each Worker and its custom domains, which needs
broader rights than CI should have. Do it once, by hand:

```bash
npx wrangler login
npm run deploy:staging        # then test staging (RUNBOOK §5)
npm run deploy:production     # then the first sign-in (RUNBOOK §6)
```

After this, CI only updates Workers that already exist.

### Step 3. Create the GitHub organisation and repository

1. Create an organisation owned by Arabs Startups (not a personal account,
   and not shared with any other company).
2. Organisation → Settings → Authentication security → **Require two-factor
   authentication** for everyone.
3. Create the repository `arabsstartups` (public or private, from section 3).
   Do not add a README or licence; the code already has them.
4. In the project folder, set a company identity for this repository only:

   ```bash
   git config user.name "Your Name"
   git config user.email "you@arabsstartups.com"
   ```

   The existing commits use a CloudSoftway address. To relabel them before
   the first push (safe only while nothing has been pushed):

   ```bash
   git rebase --root --exec "git commit --amend --no-edit --reset-author"
   ```

5. Push:

   ```bash
   git remote add origin git@github.com:<your-org>/arabsstartups.git
   git push -u origin main
   ```

### Step 4. Lock down GitHub Actions

Repository → Settings → Actions → General:

| Setting | Value |
|---|---|
| Actions permissions | **Allow \<org\>, and select non-\<org\>, actions and reusable workflows** |
| Allow actions created by GitHub | on |
| Allow specified actions | `zizmorcore/zizmor-action@*` |
| Require actions to be pinned to a full-length commit SHA | on |
| Workflow permissions | **Read repository contents and packages permissions** |
| Allow GitHub Actions to create and approve pull requests | off |
| Fork pull request workflows (public repositories) | Require approval for all external contributors |

Semgrep runs from a pinned container image, and gitleaks and actionlint are
downloaded with checksum checks, so no other actions need allowing.

### Step 5. Turn on the free security features

Repository → Settings → Advanced Security (or "Code security"):

| Feature | Plan | Setting |
|---|---|---|
| Dependabot alerts | all | on |
| Dependabot security updates | all | on |
| Grouped security updates | all | on |
| Dependabot version updates | all | already configured in `.github/dependabot.yml` |
| Secret scanning + push protection | public repositories (free), private with Secret Protection | on |
| Code scanning, CodeQL default setup | public repositories (free), private with Code Security | on |
| Private vulnerability reporting | public repositories | on |

### Step 6. Protect `main` (public repository or Team)

Settings → Rules → Rulesets → New branch ruleset:

| Field | Value |
|---|---|
| Name | `main` |
| Enforcement | Active |
| Bypass list | empty |
| Target branches | Include default branch |
| Restrict deletions | on |
| Block force pushes | on |
| Require linear history | on |
| Require a pull request before merging | on: 1 approval when two or more people work on the code (0 for a single maintainer), dismiss stale approvals, require conversation resolution |
| Require status checks to pass | on, with "Require branches to be up to date"; add the four checks below |

Required checks (they appear in the list after the first run, step 9):

- `Code quality and dependencies`
- `Secrets and workflow security`
- `Static analysis (Semgrep)`
- `Browser and production-build tests`

### Step 7. Create the deploy environments (option A only)

Settings → Environments → New environment. On Free + private this page is not
available; see the note at the end of this step.

| Environment | Deployment branches | Reviewers | Secrets |
|---|---|---|---|
| `staging` | Selected branches: `main` | none | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| `production` | Selected branches: `main` | the backup admin, with "Prevent self-review" (public repositories or Enterprise only) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

Free + private: environments cannot be configured. If you still choose option A,
add the two secrets under Settings → Secrets and variables → Actions →
**Repository secrets**. Every workflow on every branch can then read them, so
keep write access to one or two trusted people.

### Step 8. Create the Cloudflare deploy token (option A only)

1. Cloudflare dashboard → Manage account → **Account API Tokens** → Create Token.
2. Template: **Edit Cloudflare Workers**.
3. Account resources: include **only** the Arabs Startups account.
4. Zone resources: include **only** `arabsstartups.com`.
5. TTL: an end date 90 days ahead. Put a rotation reminder in the calendar.
6. Name it `GitHub CI deploy`. Create it and copy the token **once**, straight
   into the GitHub secret `CLOUDFLARE_API_TOKEN` (step 7). Never paste it into
   chat, email, a file or an issue.
7. Copy the account ID (Workers & Pages → Overview, right-hand side) into
   `CLOUDFLARE_ACCOUNT_ID`.

Tighter option: Cloudflare's newer Workers roles can limit a token to one
Worker ("Editor" on `arabsstartups-staging` only). That works for staging.
Production uses custom domains, which do not support per-Worker roles yet, so
it needs the template above. See [Workers roles](https://developers.cloudflare.com/workers/authorization/workers/).

### Step 9. First run, checks only

Actions → CI → **Run workflow** → branch `main` → deploy `none`. All four jobs
must turn green. Then add their names to the ruleset (step 6).

### Step 10. Deploy

1. Actions → CI → Run workflow → branch `main` → deploy **staging**.
2. Open the run → "Deploy to staging" → read the smoke-test table → open the
   link shown on the run page. Do the manual checks in RUNBOOK §5.
3. Run again with deploy **production**. If reviewers are set, the approver
   approves the waiting job.

### Step 11. Roll back

If the new version is live but broken:

```bash
npx wrangler rollback --name arabsstartups          # production
npx wrangler rollback --name arabsstartups-staging  # staging
```

Or: Cloudflare → Workers & Pages → the Worker → Deployments → Rollback.
A rollback restores code only. Database changes are restored with D1 Time
Travel ([OPERATIONS.md](OPERATIONS.md) → Backups and restore).

If the smoke test says **"CMS admin is closed ✖ 200"**, the CMS is open to the
internet. Roll back first, then fix the Access application (RUNBOOK §3).

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| predeploy: "still contains CHANGE-ME" or "has no database_id" | Cloudflare setup unfinished | Step 1 |
| Deploy: "Authentication error [code: 10000]" | Token expired, wrong account, or missing zone | Step 8, then update the secret |
| Deploy job never starts, "Waiting" | Production reviewers must approve | Approve in the run page |
| Deploy: "Production deploys run from main only" | Run started from another branch | Merge to `main`, run again |
| Smoke test shows `cf-mitigated: challenge` | Cloudflare bot protection challenged GitHub's servers | Turn off Bot Fight Mode, or add a WAF skip rule for the smoke-test paths |
| gitleaks finding | A real secret, or a test value that looks like one | Real: rotate it first, then remove it from history. Test value: add `gitleaks:allow` at the end of that line |
| Semgrep finding | Risky pattern | Fix it, or add `// nosemgrep: <rule-id> -- reason` |
| zizmor finding | Unsafe workflow change | Fix the workflow; do not silence the audit |
| npm audit fails | New advisory | Merge the Dependabot fix, or add an `overrides` entry for the fixed version |
| Lint fails | Rule broken | Fix it; an exception needs `// eslint-disable-next-line <rule> -- reason` |
| Required checks never appear in the ruleset | The workflow has not run yet | Step 9 |

---

## 6. Keeping it healthy

| When | Task |
|---|---|
| Weekly | Review and merge Dependabot pull requests after CI passes. Read release notes for major versions. |
| Every 90 days | Rotate the Cloudflare token: create a new one, update the GitHub secret, delete the old one. |
| Monthly | Review GitHub organisation members, Cloudflare members and tokens, and the Cloudflare audit log. |
| On any staff exit | Remove them from GitHub and Cloudflare the same day; rotate the deploy token if they could see it. |

**Updating pinned tools.** Scanner versions live at the top of `ci.yml`:

- gitleaks and actionlint: change the version, then copy the new `linux_x64`
  (gitleaks) or `linux_amd64` (actionlint) checksum from the release's
  `checksums.txt`.
- Semgrep: update the image tag and its `@sha256:` digest from Docker Hub.
- zizmor: update `version:` in the zizmor step.
- Pick releases that are at least a week old.

**Runner minutes.** One run uses about 15 runner-minutes across its jobs.
Private repositories on Free get 2,000 minutes a month (about 130 runs);
public repositories have no limit.

**Run the same checks locally:**

```bash
npm run check:lockfile
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run test:prod     # stop `npm run dev` first
```
