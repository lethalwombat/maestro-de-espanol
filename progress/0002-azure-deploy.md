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
