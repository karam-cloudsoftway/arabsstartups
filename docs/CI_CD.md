# CI/CD pipeline: review, setup and daily use

This document covers the GitHub Actions pipeline in `.github/workflows/ci.yml`:
what it checks, what the review changed, how to set everything up, and how to
deploy and roll back.

There is one environment: **production** (`arabsstartups.com`). There is no
staging site. Do the Cloudflare setup in [RUNBOOK.md](RUNBOOK.md) first; the
pipeline cannot deploy until that is done.

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

Manual run (Actions → CI → Run workflow → deploy: production)  — optional, see §3
 └─ deploy ......... starts only after all four jobs pass on the same commit
                     main only → npm ci → build → predeploy safety checks
                     → wrangler deploy (only this step sees the Cloudflare token)
                     → smoke test of the live site → summary with the rollback command
```

| Job | Fails when |
|---|---|
| Code quality and dependencies | a package comes from outside the npm registry or has no integrity hash; the lockfile is out of sync; a known vulnerability (moderate or worse in site packages, high or worse in tooling); a registry signature is invalid; any lint warning; a type error; a failing unit test; `seed/seed.json` differs from its generator |
| Secrets and workflow security | a secret anywhere in git history; a broken or unsafe workflow (unpinned action, script injection, leaked credentials, excessive permissions) |
| Static analysis (Semgrep) | a risky code pattern or a hard-coded secret |
| Browser and production-build tests | any public, comment, contact, access or episode test fails; the production build exposes the CMS, newsroom or dev helpers, or breaks the CSP |
| Deploy | the branch is not `main`; predeploy finds placeholders, test keys, a missing database id or preview URLs; the deploy fails; the live site fails a smoke check |

The smoke test (`scripts/smoke-test.mjs`; on a laptop `npm run smoke -- https://arabsstartups.com`)
checks the live site after each deploy: `/healthz` answers, the home page sends
its security headers, and `/_emdash/admin`, the CMS API, the dev setup bypass
and `/newsroom` are all closed to a visitor who is not signed in. `/dev/login`
must answer 404. While the pre-launch lock is on (RUNBOOK §4), every path must
ask for sign-in instead.

Every deploy goes straight to the live site, so the checks above are the only
gate. If a deploy breaks the site, roll back (§4 step 9).

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
| 5 | One shared concurrency group with cancel-in-progress | A push to main could cancel a deploy halfway | Runs grouped by trigger; only stale pull-request runs are cancelled; deploys queue |
| 6 | Only a type check for code quality | Bugs, accessibility problems and broken project rules go unnoticed | ESLint with TypeScript, Astro and accessibility rules, plus three AGENTS.md rules enforced in code: no secrets via `import.meta.env`, no inline `<script>`, no values interpolated into SQL |
| 7 | Only `npm audit` (high) for security | Secrets in git, unsafe workflows, risky code and tampered packages go unnoticed | gitleaks, actionlint, zizmor, Semgrep, lockfile source check, registry signature check, and a stricter audit level for site packages |
| 8 | No dependency update automation | Fixes arrive late | Dependabot for npm and Actions, with a cooldown so brand-new releases wait a few days |
| 9 | No check after deploying | A broken or exposed site could stay live unnoticed | Smoke test, including "private areas are closed" |
| 10 | Floating runner image and Node version | Surprise breakage when GitHub changes defaults | `ubuntu-24.04` and `.node-version` (24) |
| 11 | No timeout on the deploy job; package cache used in the privileged job | Hung runs; a poisoned cache could reach the job holding the token | Timeouts on every job; no cache in the deploy job |
| 12 | Playwright could skip tests silently | A stray `test.only` passes CI; the production suite could test a running dev server | `forbidOnly` in CI; the production suite never reuses a server |
| 13 | Comment promised "required reviewers" | Not available for private repositories below GitHub Enterprise | Plan options explained in section 3 |
| 14 | A deploy without database ids could create a new, empty database | Production would start with no content | `predeploy.mjs` now requires `database_id` and `preview_urls: false` |

Found on the first run on GitHub (8 Nov 2026) and fixed:

| Finding | Cause | Fix |
|---|---|---|
| `npm ci` failed in two jobs: "Missing: @emnapi/core@1.11.1 … pg@8.23.1 from lock file" | The lockfile was written by npm 11.6 on a Mac; CI's Node 24 ships npm 11.19, which checks optional packages more strictly | Lockfile regenerated with npm 11.19.1; `npm ci` now passes with both versions |
| Dependabot's React pull requests failed | `react` and `react-dom` were updated one at a time; they must always match | Dependabot updates them together (group `react`) |
| Dependabot's TypeScript 7 pull request failed | typescript-eslint and @astrojs/check do not support TypeScript 7 yet | Major TypeScript updates are ignored until they do |

Code changes made while fixing lint findings:

- `src/components/Comments.astro`, `src/components/ContactForm.astro`: the
  form script is now loaded with `<script src="...">`. Astro still bundles it
  as an external file, and the CSP rule is now checked by lint.
- `src/lib/staff/guard.ts`, `src/lib/content/embeds.ts`: removed unused initial values.
- Five SQL statements build their `WHERE` clause or table name from fixed
  text. Each now carries a comment explaining why it is safe; values stay bound.
- `package.json`: an override pins `minimatch` to `11.0.3`. It fixes advisory
  GHSA-g3hv-75wg-m249, which reached us through the new lint packages.
- `wrangler.jsonc`: `preview_urls: false`, so the site has exactly one public address.

---

## 3. Before you start: repository visibility and how you deploy

GitHub's free plan does not protect private repositories. This table decides
how strong the deploy protection can be.

| Setup | Cost | Rules on `main` | Deploy token limited to `main` | Approval before production | GitHub secret and code scanning |
|---|---|---|---|---|---|
| Free, **public** repo | $0 | yes | yes | yes | yes, free |
| Free, private repo | $0 | no | no | no | no (the pipeline's own scanners still run) |
| Team (organisation) or Pro (personal account), private repo | $4 per user per month | yes | yes | no | paid add-on |
| Enterprise Cloud, private repo | from $21 per user per month | yes | yes | yes | paid add-on |

Sources: [environments](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment),
[rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[Advanced Security on public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security),
[plans](https://github.com/pricing).

**Recommended default: Free + private repository, deploy from the owner's laptop.**

- The repository holds internal planning documents (`BUILD_PLAN.md`,
  `design/`). They must not be public.
- CI still runs every check on every push and pull request.
- Production is deployed with `npm run deploy:production` from a trusted
  laptop signed in with `npx wrangler login`.
- No Cloudflare token is stored in GitHub, which keeps plan §7 ("secrets live
  only in Cloudflare") exactly as written. Skip steps 6–8 below.

**Deploy from GitHub instead (optional).** This needs one Cloudflare deploy
token stored in GitHub, and it is safe only where GitHub can limit that token
to `main`: a public repository, or a private one on Team/Pro. The token can
deploy code, so treat it as full control of the live site. Steps 6–8 below set
it up.

---

## 4. Step-by-step setup

### Step 1. Finish the Cloudflare setup and the first deploy

Follow [RUNBOOK.md](RUNBOOK.md) §0–7. The first deploy creates the Worker and
its custom domains, which needs broader rights than CI should ever have, so it
always runs from the owner's laptop.

### Step 2. Put the repository in a company-owned place

1. Make it private: repository → Settings → General → Danger Zone → **Change
   repository visibility** → Private.
2. Create a free GitHub organisation owned by Arabs Startups (not shared with
   any other company). Organisation → Settings → Authentication security →
   **Require two-factor authentication** for everyone.
3. Move the repository there: repository → Settings → General → Danger Zone →
   **Transfer ownership** → the new organisation. History, pull requests and
   settings move with it; the old address keeps redirecting.
4. On the laptop, point the project at the new address and set a company
   identity for future commits (this repository only):

   ```bash
   git remote set-url origin git@github.com:<your-org>/arabsstartups.git
   git config user.name "Your Name"
   git config user.email "you@arabsstartups.com"
   ```

### Step 3. Lock down GitHub Actions

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

### Step 4. Turn on the security features your plan includes

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

### Step 5. First run, checks only

Push to `main`, or Actions → CI → **Run workflow** → branch `main` → deploy
`none`. All four jobs must turn green.

### Step 6. Protect `main` (public repository, Team or Pro only)

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

Required checks (they appear in the list after the first run, step 5):

- `Code quality and dependencies`
- `Secrets and workflow security`
- `Static analysis (Semgrep)`
- `Browser and production-build tests`

### Step 7. Create the `production` environment (deploys from GitHub only)

Settings → Environments → New environment → `production`:

| Setting | Value |
|---|---|
| Deployment branches | Selected branches: `main` |
| Required reviewers | the backup admin, with "Prevent self-review" (public repositories or Enterprise only) |
| Secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (step 8) |

### Step 8. Create the Cloudflare deploy token (deploys from GitHub only)

1. Cloudflare dashboard → Manage account → **Account API Tokens** → Create Token.
2. Template: **Edit Cloudflare Workers**.
3. Account resources: include **only** the Arabs Startups account.
4. Zone resources: include **only** `arabsstartups.com`.
5. TTL: an end date 90 days ahead. Put a rotation reminder in the calendar.
6. Name it `GitHub CI deploy`. Create it and copy the token **once**, straight
   into the GitHub environment secret `CLOUDFLARE_API_TOKEN` (step 7). Never
   paste it into chat, email, a file or an issue.
7. Copy the account ID (Workers & Pages → Overview, right-hand side) into
   `CLOUDFLARE_ACCOUNT_ID`.

Cloudflare's newer per-Worker roles cannot cover custom domains yet, so this
site's token needs the template above. See [Workers roles](https://developers.cloudflare.com/workers/authorization/workers/).

Then deploy: Actions → CI → Run workflow → branch `main` → deploy
**production**. If reviewers are set, the approver approves the waiting job.
Open the run → "Deploy to production" to read the smoke-test table.

### Step 9. Roll back

If the new version is live but broken:

```bash
npx wrangler rollback --name arabsstartups
```

Or: Cloudflare → Workers & Pages → `arabsstartups` → Deployments → Rollback.
A rollback restores code only. Database changes are restored with D1 Time
Travel ([OPERATIONS.md](OPERATIONS.md) → Backups and restore).

If the smoke test says **"CMS admin is closed ✖ 200"**, the CMS is open to the
internet. Roll back first, then fix the Access application (RUNBOOK §4).

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm ci`: "package.json and package-lock.json … are in sync … Missing: … from lock file" | The lockfile was written by an older npm | Use Node 24 locally, run `npm install --package-lock-only`, commit the lockfile |
| predeploy: "still contains CHANGE-ME" or "has no database_id" | Cloudflare setup unfinished | RUNBOOK §2–3 |
| Deploy: "already has externally managed DNS records" | Old parking records on `arabsstartups.com` or `www` | RUNBOOK §1 |
| Deploy: "Authentication error [code: 10000]" | Token expired, wrong account, or missing zone | Step 8, then update the secret; on a laptop run `npx wrangler login` again |
| Deploy job never starts, "Waiting" | Production reviewers must approve | Approve in the run page |
| Deploy: "Production deploys run from main only" | Run started from another branch | Merge to `main`, run again |
| Smoke test shows `cf-mitigated: challenge` | Cloudflare bot protection challenged the test | Turn off Bot Fight Mode, or add a WAF skip rule for the smoke-test paths |
| gitleaks finding | A real secret, or a test value that looks like one | Real: rotate it first, then remove it from history. Test value: add `gitleaks:allow` at the end of that line |
| Semgrep finding | Risky pattern | Fix it, or add `// nosemgrep: <rule-id> -- reason` |
| zizmor finding | Unsafe workflow change | Fix the workflow; do not silence the audit |
| npm audit fails | New advisory | Merge the Dependabot fix, or add an `overrides` entry for the fixed version |
| Lint fails | Rule broken | Fix it; an exception needs `// eslint-disable-next-line <rule> -- reason` |
| Required checks never appear in the ruleset | The workflow has not run yet | Step 5 |

---

## 6. Keeping it healthy

| When | Task |
|---|---|
| Weekly | Review and merge Dependabot pull requests after CI passes. Read release notes for major versions. |
| Every 90 days | If a Cloudflare deploy token exists: create a new one, update the GitHub secret, delete the old one. |
| Monthly | Review GitHub organisation members, Cloudflare members and tokens, and the Cloudflare audit log. |
| On any staff exit | Remove them from GitHub and Cloudflare the same day; rotate the deploy token if they could see it. |

**Dependency updates.** Dependabot (`.github/dependabot.yml`) opens update pull
requests every Monday. Routine bumps wait 3–14 days after release (the
cooldown); security fixes come at once. Packages that must match move
together (EmDash packages; `react` with `react-dom`). Use Node 24 for any
lockfile change made by hand, so the lockfile matches what CI's npm expects.

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
