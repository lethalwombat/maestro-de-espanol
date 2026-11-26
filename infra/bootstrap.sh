#!/usr/bin/env bash
# One-time (and re-runnable) setup for deploying to Azure. See docs/deployment.md.
#
# Creates, or checks and leaves alone when already right:
#   0. the resource providers the template needs (Microsoft.App, Microsoft.OperationalInsights)
#   1. the resource group (East US)
#   2. the deployment identity: a user-assigned managed identity with a GitHub OIDC
#      federated credential for this repository's main branch, and Contributor on
#      the resource group only
#   3. the Entra app registration for sign-in: single tenant, ID tokens, assignment
#      required, with you (the signed-in user) as the only assigned user, and the
#      container app's callback URL once the app exists (run this again after the
#      first deploy)
#   4. the GitHub repository variables .github/workflows/deploy.yml reads
#
# Every change is printed with "+" (created) or "~" (updated). A run that finds
# everything in place prints "0 changes" and exits 0.
#
# Usage: AZURE_SUBSCRIPTION_ID=<your personal subscription id> infra/bootstrap.sh
# Needs: az (signed in as the owner), gh (signed in, admin on the repo), jq.
set -euo pipefail

LOCATION="eastus"
RESOURCE_GROUP="rg-maestro-de-espanol"
CONTAINER_APP="maestro-de-espanol" # must match appName in infra/main.bicep
DEPLOY_IDENTITY="id-maestro-de-espanol-deploy"
FEDERATED_CREDENTIAL="github-main"
SIGN_IN_APP="Maestro de Español (sign-in)"
GITHUB_OIDC_ISSUER="https://token.actions.githubusercontent.com"
OIDC_AUDIENCE="api://AzureADTokenExchange"
DEFAULT_ACCESS_ROLE="00000000-0000-0000-0000-000000000000"
GRAPH="https://graph.microsoft.com/v1.0"

changes=0
unchanged() { echo "= $*"; }
changed() {
  echo "$1 ${*:2}"
  changes=$((changes + 1))
}
fail() {
  echo "error: $*" >&2
  exit 1
}

for tool in az gh jq; do
  command -v "$tool" >/dev/null || fail "$tool is not installed."
done

# --- 0. Safety: only ever run against the subscription you named -------------------
[[ -n "${AZURE_SUBSCRIPTION_ID:-}" ]] ||
  fail "set AZURE_SUBSCRIPTION_ID to the subscription to deploy into (az account list -o table)."
account="$(az account show --output json)" || fail "az is not signed in. Run: az login"
active_id="$(jq -r .id <<<"$account")"
[[ "$active_id" == "$AZURE_SUBSCRIPTION_ID" ]] ||
  fail "az is using subscription $active_id ($(jq -r .name <<<"$account")), not $AZURE_SUBSCRIPTION_ID. Run: az account set --subscription $AZURE_SUBSCRIPTION_ID"
TENANT_ID="$(jq -r .tenantId <<<"$account")"
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
echo "Subscription: $(jq -r .name <<<"$account") ($active_id), tenant $TENANT_ID, repository $REPO"

# Resource providers the template uses. Registering them is a subscription-level
# action the resource-group-scoped deployment identity can't do, so it happens here.
for namespace in Microsoft.App Microsoft.OperationalInsights; do
  if [[ "$(az provider show --namespace "$namespace" --query registrationState --output tsv)" == "Registered" ]]; then
    unchanged "resource provider $namespace registered"
  else
    az provider register --namespace "$namespace" --wait --output none
    changed + "resource provider $namespace registered"
  fi
done

# --- 1. Resource group --------------------------------------------------------------
if rg_location="$(az group show --name "$RESOURCE_GROUP" --query location --output tsv 2>/dev/null)"; then
  [[ "$rg_location" == "$LOCATION" ]] ||
    fail "resource group $RESOURCE_GROUP exists in $rg_location, not $LOCATION."
  unchanged "resource group $RESOURCE_GROUP ($LOCATION)"
else
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
  changed + "resource group $RESOURCE_GROUP ($LOCATION)"
fi
RG_ID="$(az group show --name "$RESOURCE_GROUP" --query id --output tsv)"

# --- 2. Deployment identity ---------------------------------------------------------
if ! identity="$(az identity show --name "$DEPLOY_IDENTITY" --resource-group "$RESOURCE_GROUP" --output json 2>/dev/null)"; then
  identity="$(az identity create --name "$DEPLOY_IDENTITY" --resource-group "$RESOURCE_GROUP" --location "$LOCATION" --output json)"
  changed + "deployment identity $DEPLOY_IDENTITY"
else
  unchanged "deployment identity $DEPLOY_IDENTITY"
fi
DEPLOY_CLIENT_ID="$(jq -r .clientId <<<"$identity")"
DEPLOY_PRINCIPAL_ID="$(jq -r .principalId <<<"$identity")"

# Ask GitHub for the subject prefix its OIDC tokens use for this repository: with
# immutable subjects it is "repo:<owner>@<owner id>/<repo>@<repo id>", not "repo:<owner>/<repo>".
oidc="$(gh api "repos/$REPO/actions/oidc/customization/sub")"
[[ "$(jq -r .use_default <<<"$oidc")" == "true" ]] ||
  fail "this repository customizes its OIDC subject claim ($oidc); the federated credential subject below assumes the default."
subject="$(jq -r '.sub_claim_prefix // empty' <<<"$oidc")"
[[ -n "$subject" ]] || subject="repo:${REPO}"
subject="${subject}:ref:refs/heads/main"
if fic="$(az identity federated-credential show --name "$FEDERATED_CREDENTIAL" --identity-name "$DEPLOY_IDENTITY" --resource-group "$RESOURCE_GROUP" --output json 2>/dev/null)"; then
  if [[ "$(jq -r .subject <<<"$fic")" == "$subject" && "$(jq -r .issuer <<<"$fic")" == "$GITHUB_OIDC_ISSUER" &&
    "$(jq -r '.audiences | join(",")' <<<"$fic")" == "$OIDC_AUDIENCE" ]]; then
    unchanged "federated credential $FEDERATED_CREDENTIAL ($subject)"
  else
    az identity federated-credential update --name "$FEDERATED_CREDENTIAL" --identity-name "$DEPLOY_IDENTITY" \
      --resource-group "$RESOURCE_GROUP" --issuer "$GITHUB_OIDC_ISSUER" --subject "$subject" \
      --audiences "$OIDC_AUDIENCE" --output none
    changed "~" "federated credential $FEDERATED_CREDENTIAL ($subject)"
  fi
else
  az identity federated-credential create --name "$FEDERATED_CREDENTIAL" --identity-name "$DEPLOY_IDENTITY" \
    --resource-group "$RESOURCE_GROUP" --issuer "$GITHUB_OIDC_ISSUER" --subject "$subject" \
    --audiences "$OIDC_AUDIENCE" --output none
  changed + "federated credential $FEDERATED_CREDENTIAL ($subject)"
fi

# Contributor on the resource group, and nothing broader.
assigned="$(az role assignment list --assignee "$DEPLOY_PRINCIPAL_ID" --role Contributor --scope "$RG_ID" \
  --query "[?scope=='$RG_ID'] | length(@)" --output tsv)"
if [[ "$assigned" == "0" ]]; then
  az role assignment create --assignee-object-id "$DEPLOY_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
    --role Contributor --scope "$RG_ID" --output none
  changed + "role Contributor for $DEPLOY_IDENTITY on $RESOURCE_GROUP"
else
  unchanged "role Contributor for $DEPLOY_IDENTITY on $RESOURCE_GROUP"
fi

# --- 3. Sign-in app registration ----------------------------------------------------
apps="$(az ad app list --filter "displayName eq '$SIGN_IN_APP'" --query "[].appId" --output tsv)"
case "$(grep -c . <<<"$apps" || true)" in
  0)
    AUTH_CLIENT_ID="$(az ad app create --display-name "$SIGN_IN_APP" --sign-in-audience AzureADMyOrg \
      --enable-id-token-issuance true --query appId --output tsv)"
    changed + "app registration '$SIGN_IN_APP' ($AUTH_CLIENT_ID)"
    ;;
  1)
    AUTH_CLIENT_ID="$apps"
    unchanged "app registration '$SIGN_IN_APP' ($AUTH_CLIENT_ID)"
    ;;
  *) fail "more than one app registration is named '$SIGN_IN_APP'; delete the extras." ;;
esac
app="$(az ad app show --id "$AUTH_CLIENT_ID" --output json)"

if [[ "$(jq -r .signInAudience <<<"$app")" != "AzureADMyOrg" ]]; then
  az ad app update --id "$AUTH_CLIENT_ID" --sign-in-audience AzureADMyOrg
  changed "~" "app registration sign-in audience: this tenant only"
fi
if [[ "$(jq -r .web.implicitGrantSettings.enableIdTokenIssuance <<<"$app")" != "true" ]]; then
  az ad app update --id "$AUTH_CLIENT_ID" --enable-id-token-issuance true
  changed "~" "app registration ID token issuance: on"
fi

# The callback URL needs the container app's hostname, which exists after the first deploy.
if fqdn="$(az resource show --resource-group "$RESOURCE_GROUP" --resource-type Microsoft.App/containerApps \
  --name "$CONTAINER_APP" --query properties.configuration.ingress.fqdn --output tsv 2>/dev/null)" && [[ -n "$fqdn" ]]; then
  callback="https://${fqdn}/.auth/login/aad/callback"
  if jq -e --arg uri "$callback" '.web.redirectUris | index($uri)' <<<"$app" >/dev/null; then
    unchanged "sign-in callback $callback"
  else
    uris=() # macOS ships bash 3.2: no mapfile
    while IFS= read -r uri; do uris+=("$uri"); done < <(jq -r '.web.redirectUris[]' <<<"$app")
    az ad app update --id "$AUTH_CLIENT_ID" --web-redirect-uris ${uris[@]+"${uris[@]}"} "$callback" # bash 3.2 + set -u: empty array guard
    changed + "sign-in callback $callback"
  fi
else
  echo "! container app $CONTAINER_APP doesn't exist yet: run this script again after the first deploy to register its sign-in callback."
fi

if ! sp="$(az ad sp show --id "$AUTH_CLIENT_ID" --output json 2>/dev/null)"; then
  sp="$(az ad sp create --id "$AUTH_CLIENT_ID" --output json)"
  changed + "service principal for '$SIGN_IN_APP'"
fi
SP_ID="$(jq -r .id <<<"$sp")"
if [[ "$(jq -r .appRoleAssignmentRequired <<<"$sp")" != "true" ]]; then
  az ad sp update --id "$SP_ID" --set appRoleAssignmentRequired=true
  changed "~" "service principal: assignment required"
else
  unchanged "service principal: assignment required"
fi

OWNER_OBJECT_ID="$(az ad signed-in-user show --query id --output tsv)"
owner_assigned="$(az rest --method GET --url "$GRAPH/servicePrincipals/$SP_ID/appRoleAssignedTo" \
  --query "length(value[?principalId=='$OWNER_OBJECT_ID'])" --output tsv)"
if [[ "$owner_assigned" == "0" ]]; then
  az rest --method POST --url "$GRAPH/servicePrincipals/$SP_ID/appRoleAssignedTo" \
    --headers "Content-Type=application/json" \
    --body "{\"principalId\":\"$OWNER_OBJECT_ID\",\"resourceId\":\"$SP_ID\",\"appRoleId\":\"$DEFAULT_ACCESS_ROLE\"}" \
    --output none
  changed + "owner ($OWNER_OBJECT_ID) assigned to '$SIGN_IN_APP'"
else
  unchanged "owner ($OWNER_OBJECT_ID) assigned to '$SIGN_IN_APP'"
fi

# --- 4. GitHub repository variables (identifiers, not secrets) ----------------------
set_variable() {
  local name="$1" value="$2" current
  current="$(gh variable get "$name" --repo "$REPO" 2>/dev/null || true)"
  if [[ "$current" == "$value" ]]; then
    unchanged "GitHub variable $name"
  else
    gh variable set "$name" --repo "$REPO" --body "$value"
    changed "$([[ -z "$current" ]] && echo + || echo "~")" "GitHub variable $name"
  fi
}
set_variable AZURE_CLIENT_ID "$DEPLOY_CLIENT_ID"
set_variable AZURE_TENANT_ID "$TENANT_ID"
set_variable AZURE_SUBSCRIPTION_ID "$AZURE_SUBSCRIPTION_ID"
set_variable AZURE_RESOURCE_GROUP "$RESOURCE_GROUP"
set_variable AUTH_CLIENT_ID "$AUTH_CLIENT_ID"
set_variable OWNER_OBJECT_ID "$OWNER_OBJECT_ID"

echo "Done: $changes changes."
