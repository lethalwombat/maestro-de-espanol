# Deployment

The app runs on Azure Container Apps in one resource group in East US. Merging to `main` deploys it once CI passes. It is for one person: it scales to zero when idle, and only the owner can sign in.

## Architecture

```
GitHub                                     Azure, East US
──────                                     ──────────────
push to main ─► CI (check, e2e)            rg-maestro-de-espanol-deploy
                 │ success                   └─ deployment identity id-maestro-de-espanol-deploy
                 ▼                              (no role here; Contributor on rg-maestro-de-espanol only)
            Deploy workflow ──OIDC──────────────┘
              │ build image, push ghcr.io/…:<sha>
              │ az deployment group create ──► rg-maestro-de-espanol
              │                                  ├─ Container Apps environment cae-maestro-de-espanol
              │                                  │    (Consumption workload profile only)
              │                                  │    └─ container app maestro-de-espanol
              │                                  │         0–1 replicas, port 3000, Easy Auth (Entra ID),
              │                                  │         image pulled from GHCR (public)
              │                                  └─ Log Analytics log-maestro-de-espanol
              │                                       (30-day retention, 0.1 GB/day cap)
              └ poll /api/health until it reports <sha>
Entra ID: app registration "Maestro de Español (sign-in)", assignment required, owner assigned
```

| Piece                  | Where                                                                | Notes                                                                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Infrastructure as code | `infra/main.bicep`, `infra/main.bicepparam`                          | Every Azure resource the app uses. Parameters come from environment variables (`IMAGE_TAG`, `AUTH_CLIENT_ID`, `OWNER_OBJECT_ID`), so the workflow and a local `what-if` use the same ones. A redeploy with the same parameters changes nothing.                                                                    |
| Image                  | `Dockerfile`, `ghcr.io/lethalwombat/maestro-de-espanol:<commit sha>` | The Next.js standalone server on `node:26-trixie-slim`, run as the unprivileged `node` user on port 3000. The commit is baked in as `APP_COMMIT_SHA`. The package is public, so Azure pulls it without registry credentials; the image contains no secrets.                                                        |
| Health                 | `GET /api/health`                                                    | `{"status":"ok","commit":"<sha>"}`. Doesn't call Claude. Excluded from sign-in, and used by the container's startup, readiness and liveness probes.                                                                                                                                                                |
| Sign-in                | Container Apps built-in auth (Easy Auth)                             | Unauthenticated browsers are sent to Microsoft sign-in. The app registration is single-tenant with "assignment required", and only the owner is assigned. Easy Auth also checks the owner's object id (`allowedPrincipals`). There is no client secret: sign-in uses the ID-token flow, so nothing needs rotating. |
| Deploy                 | `.github/workflows/deploy.yml`                                       | Signs in with GitHub OIDC (a federated credential on the deployment identity). The identity sits in its own resource group, where it holds no role, so a deploy can't change its own trust settings. No Azure secret or password is stored in GitHub, only identifiers as repository variables.                    |
| Claude                 | not configured on Azure                                              | There is no Claude credential in Azure yet, so checking a sentence returns the friendly "couldn't check that sentence" message (502). A later task adds a credential.                                                                                                                                              |

### What an anonymous request gets

Easy Auth refuses every anonymous request except `/api/health` before it reaches the app. It decides how to refuse from the request's `User-Agent`:

| Request                                                               | Response                                       |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| A browser (`Mozilla/…` User-Agent), any path, any method              | `302` to Microsoft sign-in                     |
| A browser request with `X-Requested-With: XMLHttpRequest`             | `403`                                          |
| Anything else (curl, scripts, API clients, an invalid `Bearer` token) | `401` with a `WWW-Authenticate: Bearer` header |
| `GET /api/health`, from anyone                                        | `200`                                          |

A Microsoft account other than the owner's is stopped at sign-in. An account from another tenant isn't in this single-tenant directory, and gets AADSTS50020 ("does not exist in tenant"), as tested with a second account. A member of the tenant who isn't assigned to the app should get AADSTS50105 ("not assigned to a role for the application") because assignment is required. Easy Auth's `allowedPrincipals` check would refuse them as well. Neither of those last two has been tested, because the tenant has no second member.

## One-time setup (bootstrap)

You need `az` signed in as the owner, `gh` signed in with admin rights on the repository, and `jq`. `infra/bootstrap.sh` refuses to run unless the active subscription is the one you name, so it can't land in the wrong one.

1. Pick the personal subscription and run the bootstrap:

   ```bash
   az login
   az account list --output table
   az account set --subscription <personal subscription id>
   AZURE_SUBSCRIPTION_ID=<personal subscription id> infra/bootstrap.sh
   ```

   This registers the `Microsoft.App` and `Microsoft.OperationalInsights` resource providers (a subscription-level step the deployment identity isn't allowed to do), then creates the app's resource group and a second one, `rg-maestro-de-espanol-deploy`, for the deployment identity, the deployment identity with its federated credential for `main` (the subject comes from GitHub's OIDC settings for the repository; this repository uses immutable ids, `repo:lethalwombat@84167672/maestro-de-espanol@1472674168:ref:refs/heads/main`) and Contributor role on the resource group only, and the sign-in app registration with you assigned. It also sets the repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AUTH_CLIENT_ID` and `OWNER_OBJECT_ID`.

2. Merge to `main`. The first deploy creates the Log Analytics workspace, the environment and the container app.
3. The image has to be publicly pullable. For this repository, the first push created a public package, which inherited the visibility of the public repository. If a package ever comes out private, the deploy stops at "Check the image can be pulled anonymously" with a link: open it, go to Package settings, Danger Zone, Change visibility, choose **Public**, then re-run the failed deploy.
4. Run `infra/bootstrap.sh` again (same command). It registers the app's sign-in callback (`https://<app hostname>/.auth/login/aad/callback`), which can only be known after the first deploy.

The script is idempotent: each line starts with `=` (already right), `+` (created) or `~` (updated), and a run that finds everything in place ends with `Done: 0 changes.`

## How a deploy works

1. A pull request merges into `main`, and the `CI` workflow runs on the push.
2. When CI completes, `Deploy` starts, but its job runs only if CI succeeded on a push to `main` of this repository. Pull-request runs and failed runs never deploy. The `deploy` concurrency group makes a second deploy wait for the first to finish.
3. The job checks out the commit CI tested, builds the image with `APP_COMMIT_SHA=<sha>`, and pushes `ghcr.io/lethalwombat/maestro-de-espanol:<sha>`.
4. It signs in to Azure with OIDC and runs `az deployment group create --parameters infra/main.bicepparam` with `IMAGE_TAG=<sha>`. Container Apps starts a new revision and moves traffic to it once its startup probe passes. Until then, the previous revision keeps serving.
5. `infra/wait-for-commit.sh` polls `https://<app>/api/health` until it reports `<sha>`. If it doesn't within 5 minutes, the workflow fails. The usual causes are an image that doesn't start or failing probes; see the revision's logs under Log stream in the portal, or in Log Analytics.

To check that the template and Azure agree (nothing should change):

```bash
export IMAGE_TAG=<deployed sha> AUTH_CLIENT_ID=$(gh variable get AUTH_CLIENT_ID) OWNER_OBJECT_ID=$(gh variable get OWNER_OBJECT_ID)
az deployment group what-if --resource-group rg-maestro-de-espanol --parameters infra/main.bicepparam
```

## Rolling back

Redeploy an earlier commit's image. Nothing is rebuilt, and the infrastructure stays at `main`'s version.

```bash
gh run list --workflow Deploy                       # find a commit that deployed successfully
gh workflow run Deploy --ref main -f sha=<full 40-character sha>
gh run watch                                        # fails unless /api/health reports that sha within 5 minutes
```

Or in GitHub: Actions, Deploy, Run workflow, on `main`, with the SHA. The workflow refuses SHAs that have no image in GHCR (commits that were never deployed). The next merge to `main` deploys the latest commit again.

## Cost

Expected cost is about **$0 a month** for personal use, provided the environment fee below doesn't apply. List prices (East US, pay-as-you-go, from the Azure Retail Prices API, November 2026):

| Item                                                                                                | Rate                                                | Free each month                                              | Expected use                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Container app, active (0.25 vCPU, 0.5 GiB)                                                          | $0.000024 per vCPU-second, $0.000003 per GiB-second | 180,000 vCPU-s, 360,000 GiB-s, 2 M requests per subscription | Billed only while a replica runs. With scale to zero, a few hours of use a day stays inside the free grant (180,000 vCPU-s is 200 hours at 0.25 vCPU). |
| Container app, scaled to zero                                                                       | nothing                                             |                                                              | After about 5 idle minutes the app drops to 0 replicas. The first request afterwards waits for a cold start.                                           |
| Container Apps environment (Consumption profile only)                                               | see below                                           |                                                              |                                                                                                                                                        |
| Log Analytics ingestion                                                                             | $2.30 per GB                                        | 5 GB per billing account                                     | The 0.1 GB/day cap keeps it under about 3 GB a month. 30-day retention is within the 31 days included.                                                 |
| GHCR (public package), Entra ID app registration, managed identity, GitHub Actions on a public repo | free                                                |                                                              |                                                                                                                                                        |

Worst cases: a replica that never idles costs about $14 a month (0.25 vCPU and 0.5 GiB for 730 hours, minus the free grant). Logs can't exceed the daily cap.

**Still to confirm.** Cost Management had no usage data yet on the day of the first deploy (26 November 2026); it lags by up to a day. The price list also has an "Environment Management Hour" meter at $0.10 an hour (about $73 a month), effective 1 September 2026. Microsoft's pricing page lists management fees only under the Dedicated plan, and this environment has no dedicated profile, so it shouldn't apply here. Check Cost Management for the resource group a few days after the first deploy. If the meter shows up, the environment is the cost, and tearing down is the way to stop it.

## Tearing everything down

```bash
az group delete --name rg-maestro-de-espanol --yes          # app, environment, logs
az group delete --name rg-maestro-de-espanol-deploy --yes   # deployment identity
az ad app delete --id "$(gh variable get AUTH_CLIENT_ID)"   # sign-in app registration (and its service principal)
for v in AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AUTH_CLIENT_ID OWNER_OBJECT_ID; do gh variable delete "$v"; done
```

Then delete the container package in GitHub (Packages, maestro-de-espanol, Package settings, Delete this package), and disable or delete `.github/workflows/deploy.yml` so the next merge doesn't fail trying to deploy. `infra/bootstrap.sh` recreates everything from scratch.
