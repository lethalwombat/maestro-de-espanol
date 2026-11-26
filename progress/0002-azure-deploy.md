---
task: "0002"
status: in-progress
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

## Discovered (out of scope)

- Deploys aren't ordered by commit. If CI for an older `main` commit finishes after a newer one, the older one deploys last.

## Acceptance evidence

- AC1:
- AC2:
- AC3:
- AC4:
- AC5:
- AC6:
- AC7:
- AC8:
- AC9:
- AC10:
- AC11:
- AC12:
- AC13:

## Definition of Done

(Filled in by /finish-task.)
