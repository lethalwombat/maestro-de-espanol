---
id: "0002"
title: Deploy the app to Azure from CI
---

## Objective

The app runs in Azure, and merging to `main` deploys it automatically once the PR gates pass. It is for personal use, so there is one environment, it scales to zero when idle, and only the owner can sign in. It still needs to be solid: the infrastructure is declared in code and redeploys with no changes when nothing has changed, no long-lived secrets are kept in GitHub, and a deploy fails loudly if the new version doesn't come up.

## Acceptance criteria

- AC1: `infra/main.bicep` declares every Azure resource the app uses, in one resource group in East US: a Container Apps environment on the consumption plan, the container app, and a Log Analytics workspace with 30-day retention and a daily ingestion cap. `az bicep build --file infra/main.bicep` exits 0 with no warnings.
- AC2: After a deploy, running `az deployment group what-if` with the same template and parameters reports no changes.
- AC3: A `Dockerfile` builds the Next.js production server from standalone output. The container runs as a non-root user and serves the app on the port the container app's ingress targets.
- AC4: `GET /api/health` returns 200 with `{"status":"ok","commit":"<git sha>"}` without calling Claude. The commit is the one the image was built from.
- AC5: The container app is configured with 0 minimum and 1 maximum replicas (`az containerapp show`). After it has been idle long enough to drop to 0 replicas, a request to `/api/health` wakes it and returns 200.
- AC6: An anonymous request for `/` on the deployed URL is redirected to Microsoft sign-in, and an anonymous `POST /api/feedback` is refused with 401. A Microsoft account other than the owner's can't get past sign-in, and the owner gets the home page. `/api/health` stays reachable without signing in.
- AC7: With no Claude credential in the environment, submitting a sentence returns the existing friendly "couldn't check that sentence" message (502, `unavailable`) and the app keeps serving. This is proven by a handler unit test and on the deployed app.
- AC8: `.github/workflows/deploy.yml` deploys after a push to `main` only when the `CI` workflow succeeded for that commit. It doesn't run for pull requests or after a failed CI run. Two deploys never overlap: a second one waits for the first to finish.
- AC9: The deploy workflow signs in to Azure with GitHub OIDC (a federated credential on a deployment identity). No Azure client secret or password is stored in GitHub. The deployment identity's role assignments are scoped to the app's resource group only.
- AC10: The deploy workflow builds the image, pushes it to GHCR tagged with the commit SHA, deploys `infra/main.bicep` with that tag, then polls `/api/health` on the live URL. The workflow fails if the reported `commit` doesn't match the deployed SHA within 5 minutes.
- AC11: Running the deploy workflow by hand (`workflow_dispatch`) with an earlier commit SHA redeploys that image, and `/api/health` then reports that SHA. This is the rollback path.
- AC12: `infra/bootstrap.sh` performs the one-time setup: resource group, deployment identity with its OIDC federated credential and resource-group-scoped role, the Entra app registration for sign-in (assignment required, with the owner assigned), and the GitHub repository variables the workflow reads. It is idempotent: a second run changes nothing and exits 0.
- AC13: `docs/deployment.md` describes the architecture, the bootstrap steps, how a deploy and a rollback work, the expected monthly cost and where it comes from, and how to tear everything down. `README.md` links to it.

## Out of scope

- A database and a storage account. They will be added by the first feature that persists something.
- A Claude credential on Azure (API key in Key Vault or Workload Identity Federation). LLM features show the friendly error on Azure until a later task adds one. Subscription tokens (`claude setup-token` / `CLAUDE_CODE_OAUTH_TOKEN`) are not an option: Anthropic's terms reserve them for Claude Code and Anthropic's own apps.
- Budget alerts, monitoring alerts and dashboards.
- Custom domain and certificates.
- Extra environments: staging, per-PR preview deployments, slots or revision traffic splitting.
- Azure Container Registry, Terraform, or any alternative hosting (App Service, Static Web Apps).
- Changes to `ci.yml`, `evals.yml` or any other harness file.
- Scaling beyond one replica, and performance work on cold starts.

## Notes

**Prerequisite (owner, before `/start-task 0002`).** Agents must be allowed to write `.github/workflows/deploy.yml` only. The rest of `.github/`, including `ci.yml` and `evals.yml`, stays protected. That means narrowing the `.github/` entry in `harness/lib/policy.ts` (`PROTECTED_PATHS`) and the `Edit(/.github/**)` deny rule in `.claude/settings.json`, adding a case to `harness/lib/policy.test.ts`, and updating `docs/harness.md` and the Gotchas line in `CLAUDE.md`. Do this in an unguarded session (`claude --setting-sources user,local`) or by hand, through a PR. Until it lands, AC8–AC11 are blocked.

**Decisions made while drafting:**

- Hosting: Azure Container Apps, consumption plan, scaled to zero. Cold starts on the first request after idle are accepted.
- Region: East US, in the owner's personal subscription. Switch with `az account set` before running anything; the subscription id isn't hard-coded in the repo.
- Access: Container Apps built-in authentication with a Microsoft Entra ID app registration set to "assignment required". If the provider needs a client secret, bootstrap stores it as a container app secret, never in the repo or in GitHub, and `docs/deployment.md` explains how to rotate it.
- Infrastructure as code: Bicep, so there's no state backend to host.
- Images: GHCR. The repository is public, so the image can be public and pulled without registry credentials. The image must not contain secrets.
- Gating: `deploy.yml` uses a `workflow_run` trigger on `CI`, so the gates in `ci.yml` aren't touched.
- Setup: the agent runs `bootstrap.sh` and the first deploy under the owner's `az` login, asking before each command that creates or changes Azure resources.

**Things the implementer should know:**

- Docker isn't installed locally, so the image is first built in CI unless Docker is installed.
- `next.config.ts` needs `output: "standalone"`. Editing it prompts for approval.
- AC7 needs a code change: `handler.ts` currently rethrows errors that aren't `Anthropic.APIError`, so a missing credential would probably surface as a 500. Write the failing test first. The change is in the feature handler, not in `src/lib/llm/`, a prompt or a schema, so no eval run is needed.
