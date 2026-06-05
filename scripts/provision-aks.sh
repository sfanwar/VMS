#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# provision-aks.sh — Provision AKS + deploy the VMS stack end-to-end.
#
# Assumes the repo's main branch already contains the chart/workflow fixes:
#   - .github/workflows/deploy-aks.yml  (OIDC login, admin kubeconfig, GHCR PAT
#     pull, init.sql schema apply)
#   - deploy/helm/vms/values-aks.yaml   (TLS off, serverSnippet off, managed-csi)
#   - frontend served via a static server, HPA replicas fix, migrations disabled
#     in the deploy (schema applied from init.sql instead)
#
# Run on Linux / Azure Cloud Shell (Bash) — NOT Windows `az` under WSL (avoids
# CRLF / kubeconfig-path issues). Requires: az, kubectl, helm, gh, git, openssl.
# You must be logged in:  az login   &&   gh auth login
#
# See docs/08-aks-deployment.md for the manual, step-by-step version.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ═══════════════════════ EDIT THESE ═══════════════════════
export LOCATION="${LOCATION:-uaenorth}"            # Azure region
export RG="${RG:-vms-rg}"                          # resource group (created if missing)
export CLUSTER="${CLUSTER:-vms-aks}"               # AKS cluster name
export NODE_COUNT="${NODE_COUNT:-2}"
export NODE_SIZE="${NODE_SIZE:-Standard_DS2_v2}"
export REPO="${REPO:-sfanwar/VMS}"                 # GitHub owner/repo (case-sensitive!)
export RELEASE_TAG="${RELEASE_TAG:-v0.1.0}"        # image tag to build & deploy
export IDENTITY_NAME="${IDENTITY_NAME:-vms-github-deploy}"  # user-assigned managed identity
export ENVIRONMENT="${ENVIRONMENT:-production}"     # GitHub environment name
# ══════════════════════════════════════════════════════════

echo "==> Using subscription: $(az account show --query name -o tsv)"
SUBSCRIPTION_ID="$(az account show --query id -o tsv | tr -d '\r\n')"
TENANT_ID="$(az account show --query tenantId -o tsv | tr -d '\r\n')"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Resource group + AKS cluster (idempotent)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Ensuring resource group $RG"
az group create -n "$RG" -l "$LOCATION" -o none

if ! az aks show -g "$RG" -n "$CLUSTER" -o none 2>/dev/null; then
  echo "==> Creating AKS cluster $CLUSTER (this takes several minutes)"
  az aks create \
    -g "$RG" -n "$CLUSTER" \
    --location "$LOCATION" \
    --node-count "$NODE_COUNT" \
    --node-vm-size "$NODE_SIZE" \
    --generate-ssh-keys \
    --network-plugin azure \
    --tier free \
    -o none
else
  echo "==> AKS cluster already exists; ensuring it is running"
  az aks start -g "$RG" -n "$CLUSTER" -o none 2>/dev/null || true
fi

CLUSTER_ID="$(az aks show -g "$RG" -n "$CLUSTER" --query id -o tsv | tr -d '\r\n')"

echo "==> Fetching admin kubeconfig"
# The deploy workflow uses admin creds (cluster has local accounts, no Azure RBAC),
# so we use --admin here too for parity.
az aks get-credentials -g "$RG" -n "$CLUSTER" --admin --overwrite-existing
kubectl get nodes

# ─────────────────────────────────────────────────────────────────────────────
# 2. Ingress controller (ingress-nginx)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Installing ingress-nginx"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update >/dev/null
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.externalTrafficPolicy=Local \
  --wait --timeout 5m

echo "==> Waiting for ingress public IP…"
INGRESS_IP=""
for _ in $(seq 1 40); do
  INGRESS_IP="$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  [ -n "$INGRESS_IP" ] && break
  sleep 6
done
[ -z "$INGRESS_IP" ] && { echo "ERROR: ingress IP not assigned in time"; exit 1; }
INGRESS_HOST="vms.${INGRESS_IP}.nip.io"
echo "==> Ingress IP: $INGRESS_IP   Host: $INGRESS_HOST"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Workload identity for GitHub OIDC (managed identity — no AD app-reg rights needed)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Ensuring user-assigned managed identity $IDENTITY_NAME"
az identity create -g "$RG" -n "$IDENTITY_NAME" -l "$LOCATION" -o none
UAMI_CLIENT_ID="$(az identity show -g "$RG" -n "$IDENTITY_NAME" --query clientId -o tsv | tr -d '\r\n')"
UAMI_PRINCIPAL_ID="$(az identity show -g "$RG" -n "$IDENTITY_NAME" --query principalId -o tsv | tr -d '\r\n')"

echo "==> Federated credential for repo:${REPO}:environment:${ENVIRONMENT}"
if ! az identity federated-credential show --identity-name "$IDENTITY_NAME" -g "$RG" -n vms-prod -o none 2>/dev/null; then
  az identity federated-credential create \
    --name vms-prod \
    --identity-name "$IDENTITY_NAME" \
    --resource-group "$RG" \
    --issuer "https://token.actions.githubusercontent.com" \
    --subject "repo:${REPO}:environment:${ENVIRONMENT}" \
    --audiences "api://AzureADTokenExchange" -o none
fi

echo "==> Assigning AKS roles to the identity"
# Cluster Admin Role → required because the workflow uses admin kubeconfig (admin: true)
az role assignment create --assignee-object-id "$UAMI_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service Cluster Admin Role" --scope "$CLUSTER_ID" -o none 2>/dev/null || true
# Cluster User Role → allows fetching kubeconfig
az role assignment create --assignee-object-id "$UAMI_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service Cluster User Role" --scope "$CLUSTER_ID" -o none 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# 4. GitHub Environment + secrets/variables
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Creating GitHub environment '$ENVIRONMENT'"
gh api -X PUT "repos/${REPO}/environments/${ENVIRONMENT}" >/dev/null

echo "==> Generating app secrets"
VMS_JWT_SECRET="$(openssl rand -hex 32)"
VMS_INTERNAL_API_KEY="$(openssl rand -hex 32)"
VMS_POSTGRES_PASSWORD="$(openssl rand -hex 16)"
VMS_REDIS_PASSWORD="$(openssl rand -hex 16)"
VMS_MINIO_ROOT_USER="vmsminio"
VMS_MINIO_ROOT_PASSWORD="$(openssl rand -hex 16)"

# GHCR PAT (classic, read:packages) for pulling the private images.
# Leave empty only if you have made the GHCR packages public.
read -rsp "Paste a GitHub classic PAT with read:packages (or leave empty if public): " GHCR_PAT; echo

echo "==> Setting Environment secrets"
set_secret() { gh secret set "$1" --env "$ENVIRONMENT" --repo "$REPO" --body "$2"; }
set_secret AZURE_CLIENT_ID       "$UAMI_CLIENT_ID"
set_secret AZURE_TENANT_ID       "$TENANT_ID"
set_secret AZURE_SUBSCRIPTION_ID "$SUBSCRIPTION_ID"
set_secret AKS_RESOURCE_GROUP    "$RG"
set_secret AKS_CLUSTER_NAME      "$CLUSTER"
set_secret VMS_JWT_SECRET          "$VMS_JWT_SECRET"
set_secret VMS_INTERNAL_API_KEY    "$VMS_INTERNAL_API_KEY"
set_secret VMS_POSTGRES_PASSWORD   "$VMS_POSTGRES_PASSWORD"
set_secret VMS_REDIS_PASSWORD      "$VMS_REDIS_PASSWORD"
set_secret VMS_MINIO_ROOT_USER     "$VMS_MINIO_ROOT_USER"
set_secret VMS_MINIO_ROOT_PASSWORD "$VMS_MINIO_ROOT_PASSWORD"
[ -n "$GHCR_PAT" ] && set_secret GHCR_PAT "$GHCR_PAT"

echo "==> Setting Environment variable AKS_INGRESS_HOST=$INGRESS_HOST"
gh variable set AKS_INGRESS_HOST --env "$ENVIRONMENT" --repo "$REPO" --body "$INGRESS_HOST"

# ─────────────────────────────────────────────────────────────────────────────
# 5. Build images (Release workflow) then deploy (Deploy to AKS workflow)
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Tagging $RELEASE_TAG to trigger the Release (image build) workflow"
git fetch origin --quiet
if ! git rev-parse "$RELEASE_TAG" >/dev/null 2>&1; then
  git tag "$RELEASE_TAG" origin/main
  git push origin "$RELEASE_TAG"
fi

echo "==> Waiting for the Release workflow to finish (builds 9 images; ~15-25 min)…"
sleep 10
RELEASE_RUN_ID="$(gh run list --repo "$REPO" --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
if [ -n "$RELEASE_RUN_ID" ]; then
  gh run watch "$RELEASE_RUN_ID" --repo "$REPO" --exit-status || {
    echo "ERROR: Release workflow failed — check Actions → Release"; exit 1; }
else
  echo "    (couldn't auto-detect the Release run; confirm it is green before deploying)"
fi

echo "==> Dispatching the Deploy to AKS workflow for $RELEASE_TAG"
gh workflow run deploy-aks.yml --repo "$REPO" --ref main -f tag="$RELEASE_TAG"
sleep 10
DEPLOY_RUN_ID="$(gh run list --repo "$REPO" --workflow 'Deploy to AKS' --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
[ -n "$DEPLOY_RUN_ID" ] && gh run watch "$DEPLOY_RUN_ID" --repo "$REPO" --exit-status || true

# ─────────────────────────────────────────────────────────────────────────────
# 6. Seed demo users (idempotent) and report
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Seeding demo users (password: Passw0rd!)"
kubectl -n vms rollout status deploy/auth-service --timeout=180s || true
kubectl -n vms exec deploy/auth-service -- node dist/seed.js || \
  echo "    (seed will work once auth-service pods are Running; re-run if needed)"

cat <<EOF

═══════════════════════════════════════════════════════════════
✅ Done.

  App URL:     http://${INGRESS_HOST}
  Login:       senior.admin@fad.local  /  Passw0rd!

  kubectl -n vms get pods
  Stop cluster to save cost:  az aks stop  -g $RG -n $CLUSTER
  Start it again:             az aks start -g $RG -n $CLUSTER
═══════════════════════════════════════════════════════════════
EOF
