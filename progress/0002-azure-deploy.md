---
task: "0002"
status: done
---

## Plan

### Approach

- **Infra (`infra/main.bicep` + `infra/main.bicepparam`).** One resource group in `eastus` holding a Log Analytics workspace (PerGB2018, 30-day retention, 0.1 GB/day cap), a Container Apps environment with only the `Consumption` workload profile, the container app and its `authConfigs/current`. The container app uses single revision mode, external ingress on port 3000, 0.25 vCPU / 0.5 GiB, min 0 / max 1 replicas, and startup and readiness probes on `/api/health`. It has no registry credentials (public GHCR image) and no secrets. The parameters file reads `IMAGE_TAG`, `AUTH_CLIENT_ID` and `OWNER_OBJECT_ID` with `readEnvironmentVariable()`, so CI and a local `what-if` use the same template and parameters.
- **Auth.** Easy Auth with Entra ID: `RedirectToLoginPage`, `excludedPaths: ['/api/health']`, and the single-tenant issuer `https://login.microsoftonline.com/<tenant>/v2.0`. As defence in depth on top of the Entra "assignment required" flag, `defaultAuthorizationPolicy.allowedPrincipals.identities` is set to the owner's object id. The secret question is open (see Q1).
- **Image.** A multi-stage `Dockerfile` on `node:26-*-slim`. It runs `npm ci` and `next build` with `output: "standalone"`, then the runtime stage copies `.next/standalone` and `.next/static`. The `APP_COMMIT_SHA` build arg is baked in as an env var, the image runs as the `node` user, and it serves `PORT=3000` on `HOSTNAME=0.0.0.0`. A `.dockerignore` keeps `.env*`, `.git`, `.claude` and `node_modules` out of the build context.
- **Health.** `src/features/health/handler.ts` returns `{status:"ok", commit}` from `APP_COMMIT_SHA` (or `"unknown"`). `src/app/api/health/route.ts` awaits `connection()` so the route renders at request time and isn't prerendered under `cacheComponents`.
- **AC7.** In `handler.ts`, any error that isn't an `Anthropic.APIError` is logged and becomes 502 `unavailable`. With no credential, the SDK throws a plain `Error("Could not resolve authentication method…")`.
- **Deploy workflow.** It has two triggers. `workflow_run` on `CI` (completed) runs only when the event is `push`, the branch is `main`, the conclusion is `success` and the head repo is this repo. `workflow_dispatch` takes a `sha` input. `concurrency: deploy`, without cancel-in-progress, makes a second deploy wait.
  - The job checks out the deploy SHA. On `workflow_run` it builds and pushes `ghcr.io/lethalwombat/maestro-de-espanol:<sha>`. It then checks that the image can be pulled anonymously and fails loudly if not.
  - It signs in with `azure/login` (OIDC), runs `az deployment group create` with `IMAGE_TAG=<sha>`, and finally runs `infra/wait-for-commit.sh <url> <sha> 300`.
  - On dispatch it skips the build and fails if the image for that SHA doesn't exist.
  - Third-party actions are pinned to commit SHAs.
- **Bootstrap (`infra/bootstrap.sh`).** Idempotent: every step checks before it creates. It sets up:
  - the resource group;
  - a user-assigned managed identity `id-maestro-deploy`, with a federated credential (`repo:lethalwombat/maestro-de-espanol:ref:refs/heads/main`) and Contributor on the resource group only;
  - the Entra app registration (single-tenant, ID tokens enabled), with its service principal set to `appRoleAssignmentRequired=true` and the signed-in owner assigned. The redirect URI is set once the container app exists, because its FQDN is only known after the first deploy;
  - the GitHub variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AUTH_CLIENT_ID` and `OWNER_OBJECT_ID`.

  The script refuses to run unless the active subscription matches `AZURE_SUBSCRIPTION_ID`, which must be passed explicitly.

### Files likely to change

`next.config.ts`, `src/features/health/*`, `src/app/api/health/route.ts`, `src/features/sentence-feedback/handler{,.test}.ts`, `e2e/health.spec.ts`, `Dockerfile`, `.dockerignore`, `infra/{main.bicep,main.bicepparam,bootstrap.sh,wait-for-commit.sh}`, `.github/workflows/deploy.yml`, `docs/deployment.md`, `README.md`.

### First failing test / check per criterion

- AC1: `az bicep build --file infra/main.bicep` fails (no file). Then it must build with zero warnings, and `az bicep lint` must be clean.
- AC2: `az deployment group what-if` after the first deploy, iterating on server-side defaults until it reports no changes.
- AC3: the image build in CI, plus `az containerapp show` for `targetPort`. The image's `USER` is checked with `docker`-less inspection (`crane config`) or the CI build log.
- AC4: `src/features/health/handler.test.ts`, which expects 200 and `{status:"ok",commit:<APP_COMMIT_SHA>}` without fetch being called. It fails first because the module doesn't exist. Then `e2e/health.spec.ts` against the production build.
- AC5: `az containerapp show` shows the scale settings. `az containerapp replica list` shows 0 replicas after idle, then `curl /api/health` returns 200.
- AC6: `curl -i` on `/` and `POST /api/feedback` anonymously, the owner signing in in a browser, and a non-owner account (Q3).
- AC7: a handler test with an Anthropic client built from an empty environment (no key, token, profile or config dir). It fails first with the thrown `Error` and passes after the fix. Then a sentence submitted on the deployed app while signed in.
- AC8–AC11: these need `deploy.yml` on `main` (see Q2). The evidence is run history (`gh run list`/`gh run view`): a PR-triggered CI run leads to a skipped deploy, a push to main deploys, a dispatch with an older SHA rolls back, and `wait-for-commit.sh` run locally with a wrong SHA fails at its timeout.
- AC12: run `bootstrap.sh` twice; the second run reports "no changes" for every step and exits 0.
- AC13: the doc and the README link.

### Risks

- **AC6 401 vs 302.** The docs don't say whether `RedirectToLoginPage` answers an anonymous POST with 401 or a 302 redirect. I'll check on the first deploy. If it redirects, the fallback is `AllowAnonymous` with app-level enforcement on the `x-ms-client-principal` header. That's a security design change, so I'll ask before doing it.
- **AC2 what-if noise.** Server-filled defaults (probes, `workloadProfileName`, `activeRevisionsMode`) and the write-only Log Analytics `sharedKey` may show up as changes. Declare them explicitly and iterate.
- **Default branch only.** GitHub runs `workflow_run` and `workflow_dispatch` only from workflow files on the default branch, so AC8, AC10 and AC11 can't be proven before this branch merges.
- **First GHCR push is private.** Visibility can only be changed in the GitHub UI. The workflow detects this and fails with a link, and the owner flips it once.
- **Redirect URI.** It needs the app FQDN, which exists only after the first deploy, so bootstrap is run once more afterwards. A third run must then change nothing (AC12).
- **Out-of-order deploys.** Two CI runs on `main` could finish out of order and deploy an older commit last. It's not in the ACs, so it's noted, not handled.

### Decisions (owner, 2026-11-26)

- Q1, sign-in flow: **no secret**. Implicit ID-token flow, with assignment required and an owner-only `allowedPrincipals` check. No container app secrets.
- Q2, sequencing: **two PRs**. Bootstrap runs before the merge, and PR 1 ships everything with the task `in-progress`. Evidence for AC3–AC11 comes after the first automatic deploy, and `/finish-task` lands in PR 2.
- Q3, non-owner test: **the owner's second Microsoft account**. The owner tries it and reports the result.

## Log

- 2026-11-26: Started. The task branch existed with only the spec commit and was based on the old `main`. I rebased it (unpushed, so no shared history was rewritten) onto `main` 5036e6b, which contains the prerequisite harness PR #1 (`deploy.yml` is agent-writable).
- 2026-11-26: Read the SDK. With no credential, `client.beta.messages.create` throws a plain `Error("Could not resolve authentication method…")` from `validateHeaders`, not an `APIError`, so the handler currently rethrows it (500).
- 2026-11-26: Container Apps Easy Auth docs: the `unauthenticatedClientAction` values are `AllowAnonymous`, `RedirectToLoginPage`, `Return401` and `Return403`. With no client secret, the implicit flow (ID token only) is used, and the docs discourage it. Managed-identity FIC instead of a secret is documented for App Service only. The 401-vs-302 behaviour for AJAX or POST isn't documented.
- 2026-11-26: AC7, test first. `handler.test.ts` gained "with no Claude credential in the environment > returns the friendly 502 and keeps serving". It uses a real `new Anthropic({ fetch })` with every credential variable unset and `ANTHROPIC_CONFIG_DIR` pointed at an empty temp dir. Before the fix it failed with `Error: Could not resolve authentication method…`, thrown from `handleFeedbackRequest`. Fix: non-`APIError` errors are logged and answered with 502 `unavailable`. 12/12 tests pass.
- 2026-11-26: AC4, test first. `src/features/health/handler.test.ts` failed with `Cannot find module './handler'` and then passed 2/2. The route awaits `connection()`, and `next build` lists `ƒ /api/health` (dynamic, not prerendered). `e2e/health.spec.ts` passes against the production build. It was written after the handler, so it was never seen failing; the unit test was.
- 2026-11-26: AC3, no Docker locally. I smoke-tested `.next/standalone/server.js` the way the image runs it (`env -i`, `PORT`, `HOSTNAME`, `APP_COMMIT_SHA=abc123`, no Claude credential). `/api/health` returned `{"status":"ok","commit":"abc123"}` with `cache-control: no-store`, `/` and its CSS returned 200, and `POST /api/feedback` returned 502 `unavailable`, after which health still returned 200. Gotcha: Next renames its process to `next-server`, so `pkill -f "node server.js"` misses it. Kill by PID.
- 2026-11-26: AC1, the template. `az bicep build` failed first (no file). Microsoft.App `2026-07-01` has no types in local Bicep 0.47 (BCP081), so I used `2026-01-01` and OperationalInsights `2025-07-01`. `az bicep build` and `az bicep lint` now exit 0 with no diagnostics; the only stderr line is az's "new Bicep release available" notice.
- 2026-11-26: AC10 helper. `infra/wait-for-commit.sh` was run locally against the standalone server. The right SHA gives exit 0. A wrong SHA with a 5 s timeout gives exit 1 with `::error::After 5s … reports commit 'abc123', not deadbeef`. No server gives exit 1 with `'<no answer>'`. Shellcheck is clean.
- 2026-11-26: `deploy.yml`. Prettier is clean, the YAML parses (triggers `workflow_run` and `workflow_dispatch`), and every `run:` block passes shellcheck. actionlint isn't installed, and downloading its binary was refused by the auto-mode classifier, so it wasn't run. Third-party actions are pinned to the release commit SHAs (azure/login v3.1.0, docker/* v4/v7).
- 2026-11-26: AC12, script. `bootstrap.sh` passes shellcheck and `bash -n` under macOS bash 3.2 (I replaced `mapfile`). The subscription guard refuses with no `AZURE_SUBSCRIPTION_ID` (exit 1) and refuses when az is on another subscription (exit 1; az is currently on the work subscription). It hasn't run against Azure yet.
- 2026-11-26: Cost lookup (Azure Retail Prices API). Container Apps consumption is $0.000024 per vCPU-s and $0.000003 per GiB-s, and the free grant is 180k vCPU-s, 360k GiB-s and 2M requests per subscription. Log Analytics is $2.30/GB, with 5 GB/month free per billing account and 31 days of retention included. Open question: an "Environment Management Hour" meter at $0.10/h, effective 2026-09-01, may or may not apply to a Consumption-only environment. `docs/deployment.md` says so, and it gets confirmed in Cost Management after the first deploy.
- 2026-11-26: `npm run verify` passes (tasks, format, typecheck, lint, unit, e2e).
- 2026-11-26: The owner signed in to the personal subscription `pay-as-you-go` (152440e2-…a4ca, tenant b1b4e555-…3890, which isn't the work tenant) and confirmed the bootstrap run.
  - Run 1: `Done: 14 changes.`, covering the resource group, identity, federated credential, Contributor role, app registration, service principal, assignment required, owner assignment and 6 variables. The callback was skipped because the container app doesn't exist yet.
  - Run 2: every line `=`, `Done: 0 changes.`, exit 0.
- 2026-11-26: AC9 check. `az role assignment list --assignee <deploy identity> --all` returns only `Contributor` on `/subscriptions/…/resourceGroups/rg-maestro-de-espanol`. `gh secret list` is empty. The sign-in app is `AzureADMyOrg` with ID tokens on, access tokens off, 0 secrets and 0 certificates, and its service principal has `appRoleAssignmentRequired: True`.
- 2026-11-26: A pre-merge `what-if` (read-only, owner login) shows Create ×4 and Ignore ×1 (the deploy identity, which isn't in the template), so ARM accepts the template.
- 2026-11-26: Surprise: `Microsoft.App` and `Microsoft.OperationalInsights` were `NotRegistered` in the fresh subscription, and the RG-scoped deploy identity can't register providers. I added an idempotent provider step to `bootstrap.sh`. Run 3: `+` for both providers, `Done: 2 changes.` Run 4: `Done: 0 changes.`, exit 0.
- 2026-11-26: Part 1 merged (PR #2, `3e3f0aa`). CI on `main` passed and Deploy started via `workflow_run` (run 45770939641).
  - Attempt 1: the image was built and pushed, and it was already publicly pullable (no visibility step needed). Then `azure/login` failed with `AADSTS700213: No matching federated identity record found for presented assertion subject 'repo:lethalwombat@84167672/maestro-de-espanol@1472674168:ref:refs/heads/main'`. The repo's OIDC tokens use immutable subjects (`gh api repos/…/actions/oidc/customization/sub` → `use_immutable_subject: true`).
  - Fix: bootstrap reads `sub_claim_prefix` from that API. Then 1 change (`~ federated credential`), then 0.
  - Attempt 2 succeeded. `wait-for-commit.sh` logged `<no answer>` twice, then `Live: https://maestro-de-espanol.orangewave-6ff96f53.eastus.azurecontainerapps.io/api/health reports commit 3e3f0aa…`.
- 2026-11-26: Bootstrap after the first deploy hit `uris[@]: unbound variable` (bash 3.2 with `set -u` on an empty array; this code path had never run). Fixed. Then `+ sign-in callback https://…/.auth/login/aad/callback`, 1 change, then 0 changes.
- 2026-11-26: AC6 probes (anonymous, live).
  - `GET /` with browser headers: `302` to `login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize?response_type=id_token…&response_mode=form_post`.
  - `POST /api/feedback` without a browser User-Agent (curl default, `python-requests`, or with a bad bearer token): `401` with `WWW-Authenticate: Bearer`.
  - `POST /api/feedback` with a browser UA (`Mozilla/5.0`): `302` to sign-in. With a browser UA plus `X-Requested-With: XMLHttpRequest`: `403`.
  - `GET /api/health`: `200`.
  - So Easy Auth picks redirect vs 401 by User-Agent. The app's own form `fetch` would get a 302. None of these reach the app.
- 2026-11-26: AC2, first what-if after the deploy. 3 modifies, all noise: unstated server defaults (`exposedPort`, `maxInactiveRevisions`, `cooldownPeriod`, `pollingInterval`, `peerAuthentication`, `peerTrafficConfiguration`, `publicNetworkAccess`, `isAutoProvisioned`), probe order (Azure stores Liveness, Readiness, Startup), and `customerId` shown as an unresolved `reference()`.
  - Fix: state the defaults, reorder the probes, and switch the environment to `destination: 'azure-monitor'` plus a `diagnosticSettings` resource that names the workspace by resource id (no `reference()`, no shared key).
  - what-if now shows only the intended changes: `+ diagnosticSettings/to-log-analytics`, `~ appLogsConfiguration.destination log-analytics => azure-monitor`, and `=` for the app, auth config and workspace. To be redeployed and rechecked.
- 2026-11-26: AC3, live. The image config from GHCR (anonymous) has `User: node`, `ExposedPorts: 3000/tcp`, `Cmd: node server.js`, `PORT=3000`, `HOSTNAME=0.0.0.0` and `APP_COMMIT_SHA=3e3f0aa…`. `az containerapp show` reports `targetPort: 3000`, `external: true`, `minReplicas: 0`, `maxReplicas: 1`, `cpu 0.25`, `memory 0.5Gi`, `secrets: null` and `registries: null`.
- 2026-11-26: AC5, live. Nothing was sent to the app while `az containerapp replica list` was polled every 60 s: `replicas=1` from 07:03:11 to 07:07:22, then `replicas=0` at 07:08:24. A single `GET /api/health` at 07:08:24 returned `200 in 25.889753s` (cold start) with `{"status":"ok","commit":"3e3f0aa…"}`, and `replicas after wake=1`.
- 2026-11-26: AC2. With the owner's approval, I deployed the noise fix from the branch under the owner's login (`IMAGE_TAG=3e3f0aa…`), which succeeded.
  - what-if then showed only the diagnostic setting, because Azure stores all 7 environment log categories plus `AllMetrics` with `retentionPolicy {days 0, enabled false}`. I declared all of them, in Azure's order.
  - what-if before redeploying: `5 no change, 1 to ignore`. I deployed again (succeeded). what-if after that deploy: `Resource changes: 5 no change, 1 to ignore.` The ignored one is the deploy identity, which isn't in the template.
  - `az containerapp revision list` still shows the single revision `maestro-de-espanol--jljx43g`, so the redeploys didn't restart the app.
- 2026-11-26: AC6, owner decision. The platform behaviour (browser UA → 302 to sign-in, non-browser → 401, browser plus XHR header → 403, all refused before the app) is accepted as meeting AC6. It's documented in `docs/deployment.md` under "What an anonymous request gets".
- 2026-11-26: AC6, owner's browser test. The owner signed in with lethalwombat@outlook.com and reached the home page. The owner's second account, igor.churkin@manuka-ai.com.au (another tenant), was refused at sign-in with `AADSTS50020: User account … from identity provider 'https://sts.windows.net/98fe2bdb-…/' does not exist in tenant 'Default Directory' and cannot access the application '1ec317b7-…'(Maestro de Español (sign-in)) in that tenant.`
- 2026-11-26: Another session ran tasks 0003 (commit and PR standards, PR #3) and 0004 (Claude Code Review, PR #5) in this checkout, which switched it off this branch. Both merged. Part 1 was merged as a merge commit, so I rebased the 4 unpushed part-2 commits onto `origin/main` 338f826 cleanly.
  - Those 4 headers are 79–101 characters, over 0003's new 72-character limit. They predate the rule, `pr:check` doesn't check branch commits, and the squash merge keeps only the PR title, so I left them. New commits follow `CONTRIBUTING.md`.
- 2026-11-26: AC8 and AC10, run history (`gh run list --workflow Deploy`). Each merge to `main` deployed via `workflow_run` once CI passed: 45770939641 (`3e3f0aa`), 45780244742 (`5e12c16`) and 45781164449 (`338f826`), all `success`. PR CI runs (e.g. 45770516119 on `task/0002-azure-deploy`, `pull_request`) started no Deploy run, because the `branches: [main]` filter applies to the CI run's head branch.
  - The `338f826` deploy left `/api/health` reporting `338f8264108fff5d9d1a9d8480c967ca64ea48c6`, the tip of `origin/main`.
  - Each run's "Wait for the new version to serve" step logged `Live: …/api/health reports commit <sha>.`
- 2026-11-26: Those `main` deploys used part 1's template, so Azure is back to `destination: 'log-analytics'`. The diagnostic setting from the manual deploy is left in place, because deploys are incremental. AC2 has to be rechecked after part 2 merges and the workflow deploys the fixed template.
- 2026-11-26: AC11, with the owner's approval.
  - `gh workflow run Deploy --ref main -f sha=3e3f0aa…` (run 45781645303) succeeded. The build steps were `skipped`, the pull check and deploy passed, and the log shows `Live: …/api/health reports commit 3e3f0aa34999df8948bfbee1ffb29cc89b191f54.` `curl` agreed.
  - Restored with `-f sha=338f826…` (run 45781909561, success): `Live: … reports commit 338f8264108fff5d9d1a9d8480c967ca64ea48c6.`
  - Negative case: `-f sha=0000…0000` (run 45782149413) failed at "Check the image can be pulled anonymously" with `##[error]ghcr.io/lethalwombat/maestro-de-espanol:0000…0000 can't be pulled (HTTP 404). Only commits that were deployed from main have an image…`. `azure/login` was `skipped`, so Azure wasn't touched.
- 2026-11-26: AC7, deployed app. Signed in, the owner submitted "Hello" and the page showed "The tutor couldn't check that sentence just now. Please try again." (owner's screenshot), and stayed usable. In Log Analytics, `ContainerAppConsoleLogs_CL | where Log has 'sentence-feedback'` shows `sentence-feedback: unexpected error: Error: Could not resolve authentication method…` at 07:26:56, 07:32:57–59 and 08:21:04 UTC. That's the non-API-error branch that answers 502 `unavailable`, and the app served each later request.
- 2026-11-26: `/finish-task`. `npm run verify` on the final branch passed:

  ```text
  harness check --full:
    ✔ tasks (0.1s)
    ✔ format (1.5s)
    ✔ typecheck (2.0s)
    ✔ lint (3.6s)
    ✔ unit (9.5s)
    ✔ e2e (4.1s)

  All checks passed.
  ```

  No eval run: the diff touches no prompt, schema or `src/lib/llm/` file (the AC7 fix is in `src/features/sentence-feedback/handler.ts`).

- 2026-11-26: Reviewer findings and responses:
  1. **Bug, fixed.** Workflow-level `concurrency` let `workflow_run` events whose job is skipped join the `deploy` group, and GitHub keeps only one pending run per group, so a skipped run could cancel a queued deploy. Moved `concurrency` onto the job (commit `fix(deploy): job-level concurrency for deploys`). The YAML parses with `concurrency` on `jobs.deploy` only.
  2. **AC8 evidence is config only for "waits" and "not after failed CI".** The owner chose not to run a live double-dispatch, so the evidence is the job-level `concurrency: {group: deploy, cancel-in-progress: false}` plus the job `if` that requires `workflow_run.conclusion == 'success'`. A failed CI run on protected `main` can't be produced on demand.
  3. **AC2 after the merge.** The clean what-if came from deploying this branch's exact template and parameters. The merge deploys the same template through the workflow, and I'll run what-if once more afterwards as confirmation.
  4. **AC1 rechecked on the final template.** `az bicep build --file infra/main.bicep` gives exit 0 and no diagnostics; `az bicep lint` gives exit 0 and no diagnostics.
  5. and 7. **Docs overclaimed, fixed.** `docs/deployment.md` now:
     - gives the immutable OIDC subject;
     - says this repo's package came out public;
     - says that only cross-tenant refusal (AADSTS50020) was tested, while AADSTS50105 and `allowedPrincipals` for unassigned in-tenant members are expected but untested.
  6. **Cost.** A month-to-date Cost Management query on `rg-maestro-de-espanol` returned `[]` (usage data lags up to a day). The doc says the environment meter is still to be confirmed. This is listed under Discovered as a follow-up check.
  7. **Fixed, with the owner's approval.** The deploy identity sat in the resource group it has Contributor on, so it could edit its own federated credentials.
     - `bootstrap.sh` now keeps it in `rg-maestro-de-espanol-deploy`. Run 1 made 5 changes: the new RG, identity, FIC, Contributor on the app RG, and the `~ AZURE_CLIENT_ID` variable. Run 2 made 0.
     - A no-op dispatch (run 45783922020, `338f826`) signed in with the new identity and reported `Live: … 338f826…`.
     - I then deleted the old identity's Contributor assignment and the old identity. The app RG now has a single role assignment (the new identity), and the identity's RG has none.
     - Bootstrap after the cleanup: `Done: 0 changes.`, with no warning.
  8. **Environment-scoped OIDC subject.** The owner chose to record it under Discovered.
  9. **Definition of Done.** Filled in below. The `e2e/health.spec.ts` test was written after the route and wasn't seen failing first. Checked afterwards: with `src/app/api/health/route.ts` moved away, it fails with `Expected: 200 Received: 404`, then passes with the route restored.

## Discovered (out of scope)

- Deploys aren't ordered by commit. If CI for an older `main` commit finishes after a newer one, the older one deploys last.
- The OIDC trust is `…:ref:refs/heads/main`, so any workflow on `main` that requests `id-token: write` can sign in to Azure. Today only `deploy.yml` does. A GitHub `production` environment with an `environment:` subject would limit that to the deploy job (reviewer finding; the owner chose a follow-up).
- Confirm in Cost Management, a day or more after 2026-11-26, whether the "Environment Management Hour" meter ($0.10/h) bills this Consumption-only environment. If it does, the expected cost is about $73/month, not about $0.
- Unassigned in-tenant members (AADSTS50105) and Easy Auth's `allowedPrincipals` refusal haven't been tested live; the tenant has no second member.
- GitHub keeps one pending run per concurrency group, so a merge arriving while a rollback dispatch waits behind a running deploy replaces the queued rollback. Re-dispatch the rollback if that happens.

## Acceptance evidence

- AC1: `az bicep build --file infra/main.bicep` and `az bicep lint` exit 0 with no diagnostics on the final template (log 2026-11-26, reviewer item 4). One resource group in `eastus`. The resources are:
  - a Container Apps environment with only the `Consumption` workload profile;
  - the container app;
  - a Log Analytics workspace (PerGB2018, `retentionInDays: 30`, `workspaceCapping.dailyQuotaGb: 0.1`) fed by an environment diagnostic setting.

  The deploy identity is bootstrap infrastructure and lives in `rg-maestro-de-espanol-deploy`.

- AC2: After deploying this branch's template with the same `infra/main.bicepparam` parameters, `az deployment group what-if` gave `Resource changes: 5 no change, 1 to ignore.` (the ignored one was the old deploy identity, since moved out). `az containerapp revision list` still showed one revision. To be rechecked once after the part-2 merge deploy.
- AC3: `Dockerfile` builds the standalone server. The image config from GHCR has `User: node`, `ExposedPorts: 3000/tcp`, `Cmd: node server.js`, `PORT=3000` and `HOSTNAME=0.0.0.0`. `az containerapp show` reports `targetPort: 3000` and `external: true`. Every deploy built it and passed the health check.
- AC4: `src/features/health/handler.test.ts`:
  - "reports ok and the commit the image was built from, without calling Claude" (fetch spy not called);
  - "reports the commit as unknown outside a built image";
  - plus `e2e/health.spec.ts`, "the health endpoint reports ok and the build's commit".

  Live: `/api/health` returns `{"status":"ok","commit":"<sha>"}` matching the GHCR image's `APP_COMMIT_SHA` build arg (e.g. `3e3f0aa…`, then `338f826…`). `next build` lists `ƒ /api/health`.

- AC5: `az containerapp show` reports `minReplicas: 0` and `maxReplicas: 1`. Left idle: `replicas=1` until 07:07:22, then `replicas=0` at 07:08:24. `GET /api/health` then returned `200 in 25.889753s`, followed by `replicas after wake=1`.
- AC6: Anonymous `GET /` (browser) gets a `302` to `login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize?response_type=id_token…`. Anonymous `POST /api/feedback` (non-browser) gets a `401` with `WWW-Authenticate: Bearer`. A browser POST gets a 302 to sign-in, and the owner accepted that as meeting AC6. `GET /api/health` returns `200` without sign-in. The owner signed in and got the home page. The owner's second account was refused with `AADSTS50020 … does not exist in tenant 'Default Directory'`.
- AC7: `src/features/sentence-feedback/handler.test.ts`, "with no Claude credential in the environment > returns the friendly 502 and keeps serving" (seen failing first). Deployed app: the owner's screenshot shows "The tutor couldn't check that sentence just now. Please try again.", and Log Analytics shows `sentence-feedback: unexpected error: Error: Could not resolve authentication method…` at 07:26:56, 07:32:57–59 and 08:21:04 UTC, with the app serving after each.
- AC8: `deploy.yml` has `on: workflow_run: {workflows: [CI], types: [completed], branches: [main]}` and a job `if` requiring `conclusion == 'success'`, `event == 'push'`, `head_branch == 'main'` and the head repository to be this repo. Job-level `concurrency: {group: deploy, cancel-in-progress: false}` makes a second deploy wait.
  - Runs: each merge deployed after CI (45770939641 `3e3f0aa`, 45780244742 `5e12c16`, 45781164449 `338f826`).
  - The PR CI run 45770516119 started no Deploy.
  - Failed-CI skipping and queueing are shown by configuration only (owner's choice).
- AC9: `azure/login` uses `client-id`, `tenant-id` and `subscription-id` from repo variables with `id-token: write`. `gh secret list` is empty. The federated credential `github-main` has subject `repo:lethalwombat@84167672/maestro-de-espanol@1472674168:ref:refs/heads/main`. `az role assignment list --assignee <new identity> --all` returns only `Contributor` on `/subscriptions/…/resourceGroups/rg-maestro-de-espanol`. Login succeeded in runs 45770939641 (attempt 2) through 45783922020.
- AC10: Run 45770939641 built and pushed `ghcr.io/lethalwombat/maestro-de-espanol:3e3f0aa…` (`--build-arg APP_COMMIT_SHA`), deployed `infra/main.bicep` with `IMAGE_TAG`, then `wait-for-commit.sh` logged `Waiting … <no answer>` ×2 and then `Live: … reports commit 3e3f0aa…`. The failure path was run locally: a wrong SHA with a 5 s timeout gave exit 1 with `::error::After 5s … not deadbeef`, and no server gave exit 1. The workflow passes `300` (5 minutes).
- AC11: `gh workflow run Deploy --ref main -f sha=3e3f0aa…` (run 45781645303) skipped the build and logged `Live: … reports commit 3e3f0aa…`. Restored with run 45781909561 (`338f826…`). An unknown SHA (run 45782149413) is refused with `can't be pulled (HTTP 404)` before signing in to Azure.
- AC12: `AZURE_SUBSCRIPTION_ID=… infra/bootstrap.sh` covers the providers, both resource groups, the identity, the FIC with GitHub's subject prefix, Contributor on the app RG, the app registration (`AzureADMyOrg`, ID tokens, 0 secrets) with the callback once the app exists, the service principal with `appRoleAssignmentRequired: True`, the owner assignment and 6 GitHub variables. Every change run was followed by a run reporting `Done: 0 changes.` and exit 0, the latest after the identity move. It refuses a missing or mismatched subscription (exit 1).
- AC13: `docs/deployment.md` covers the architecture diagram and table, what anonymous requests get, the one-time setup, how a deploy works plus the what-if command, rolling back, cost (rates, free grants, worst case, and the unconfirmed environment meter) and teardown of both resource groups, the app registration, the variables and the package. `README.md` links to it in its "Deployment" section.

## Definition of Done

- [x] `npm run verify` passes (format, typecheck, lint, unit tests with coverage thresholds, production build, e2e), and its summary is pasted in the progress log.
- [x] If a prompt, an output schema or anything in `src/lib/llm/` changed, `npm run evals` meets the suite threshold and the summary is in the progress log. — N/A: no prompt, schema or `src/lib/llm/` change (the AC7 fix is in the feature handler).
- [x] Every acceptance criterion has evidence under "Acceptance evidence": the test that proves it, or the command and output for what a test can't show.
- [x] New behaviour was written test-first: each new test was seen failing before the code that makes it pass. The unit tests for AC7 and AC4 were seen failing first. `e2e/health.spec.ts` was written after the route and only checked afterwards (it fails with `Expected: 200 Received: 404` when the route is removed). The owner accepted this on 2026-11-26.
- [x] User-visible behaviour is covered by an e2e test, or the progress file says why not. `e2e/health.spec.ts` covers the health endpoint. The friendly 502 is covered by the handler unit test and was checked on the deployed app, because the e2e harness always runs with a mock Claude credential (`playwright.config.ts`, human-owned).
- [x] The diff serves this task's acceptance criteria and nothing else. Unrelated findings are listed under "Discovered", not fixed. The identity move to its own resource group is reviewer-found hardening of AC9's identity, approved by the owner.
- [x] No test, assertion, lint rule or threshold was removed or loosened, and there is no new `eslint-disable`, `@ts-expect-error`, `.skip` or `.only`.
- [x] No new dependency, unless the task needed one and the user approved the install.
- [x] No secrets, API keys or `.env` contents in code, fixtures, logs or commits. The repo holds identifiers only, `.dockerignore` excludes `.env*`, and there are no GitHub secrets.
- [x] The `reviewer` subagent reviewed the diff against the spec, and every correctness gap it found is fixed or answered in the progress file.
- [x] Docs are updated wherever behaviour, commands or setup changed.
- [x] The work is committed on the task branch with commit messages in the format in `CONTRIBUTING.md`. Part-2 commits made after task 0003 pass the `commit-msg` hook. The four earlier ones predate the rule, and the squash merge keeps only the PR title.

## Pull request

fix(infra): Azure deploy fixes from the first live runs (task 0002)

```markdown
## Task

0002 — tasks/0002-azure-deploy.md (part 2 of 2)

## Summary

Part 1 (#2) shipped the app, image, Bicep, deploy workflow and bootstrap. This part fixes what the first live deploys found, and closes the task with live evidence:

- **OIDC subject.** The repo's tokens use immutable subjects (`repo:<owner>@<id>/<repo>@<id>`), so `bootstrap.sh` now reads the prefix from GitHub. The first deploy failed with AADSTS700213 until this was fixed.
- **Clean what-if.** `main.bicep` states the server defaults and the probe order. Logs now reach Log Analytics through a diagnostic setting instead of `reference()`/`listKeys()`, so a redeploy reports no changes.
- **Deploy concurrency.** The group is now set on the job, so skipped `workflow_run` events can't cancel a queued deploy.
- **Identity location.** The deploy identity moved to its own resource group (`rg-maestro-de-espanol-deploy`), so a deploy can't edit its own federated credentials. The old one is deleted.
- **Bootstrap fixes.** Bootstrap registers the resource providers and handles bash 3.2.
- **Docs.** `docs/deployment.md` now says what anonymous requests get, and only what was actually observed.

## Acceptance criteria

- AC1: `az bicep build`/`lint` on the final template exit 0 with no diagnostics.
- AC2: after a deploy of this template, what-if reports `5 no change` (rechecked after merge).
- AC3: the GHCR image config has `User: node` and port 3000; the app's `targetPort` is 3000.
- AC4: `src/features/health/handler.test.ts`, `e2e/health.spec.ts`; live `/api/health` reports the image's commit.
- AC5: 0/1 replicas configured; scaled to 0, then woke with `200 in 25.9s`.
- AC6: anonymous `/` gets a 302 to sign-in, anonymous `POST /api/feedback` (non-browser) gets a 401, health gets a 200; the owner gets in, and the second account is refused (AADSTS50020).
- AC7: the handler unit test, plus the owner's screenshot and Log Analytics lines from the deployed app.
- AC8: `workflow_run` on successful CI pushes to main only, with job-level concurrency; runs 45770939641, 45780244742 and 45781164449 deployed and PR CI started none.
- AC9: OIDC login only, no GitHub secrets, identity role is Contributor on the app RG only.
- AC10: build, push, deploy and health poll in every run; a wrong SHA times out with exit 1.
- AC11: dispatch to `3e3f0aa` redeployed it without building, then restored; an unknown SHA is refused with 404.
- AC12: every bootstrap run with changes was followed by `Done: 0 changes.`, exit 0.
- AC13: `docs/deployment.md` (architecture, setup, deploy, rollback, cost, teardown), linked from the README.

Full evidence is in `progress/0002-azure-deploy.md`.

## Verification

`npm run verify`: tasks, format, typecheck, lint, unit and e2e all pass ("All checks passed."). Checked by hand against Azure and GitHub Actions: deploy runs, the rollback dispatches, what-if, replica scaling, anonymous requests, owner and non-owner sign-in, and Log Analytics.

## Discovered

- Deploys aren't ordered by commit: CI finishing out of order could deploy an older commit last.
- The OIDC trust covers any workflow on `main`; a `production` environment subject would limit it to the deploy job.
- Whether the $0.10/h "Environment Management Hour" meter bills a Consumption-only environment is still to be confirmed in Cost Management.
- In-tenant unassigned users (AADSTS50105) and `allowedPrincipals` refusals are untested.
- A merge arriving while a rollback dispatch waits replaces the queued rollback.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
