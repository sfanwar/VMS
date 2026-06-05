# AKS Deployment

Deployment to Azure Kubernetes Service is a **standalone, on-demand workflow**
(`.github/workflows/deploy-aks.yml`), separate from the `Release` workflow that
builds and scans images. Run it *after* a release to roll that version onto the
cluster.

```
push tag vX.Y.Z ──► Release (build-and-push + scan-images) ──► images in GHCR
                                                                     │
                          manual run, supply the tag ──► Deploy to AKS (helm upgrade --install)
```

The deploy workflow does **not** build anything — it only deploys images the
Release workflow already pushed to GHCR for the given tag.

## One-command provisioning

For a brand-new cluster, [`scripts/provision-aks.sh`](../scripts/provision-aks.sh)
does everything below end-to-end: creates the resource group + AKS cluster,
installs ingress-nginx, derives a `nip.io` host, sets up the GitHub OIDC managed
identity + federated credential + AKS roles, configures the `production`
Environment (generated app secrets + prompted GHCR PAT + ingress host), then
tags a release, waits for the build, dispatches the deploy, and seeds demo users.

```bash
# Linux / Azure Cloud Shell (Bash). Requires: az, kubectl, helm, gh, git, openssl
az login && gh auth login
RG=vms-rg CLUSTER=vms-aks LOCATION=uaenorth REPO=<owner>/<repo> bash scripts/provision-aks.sh
```

> Run it on Linux or Azure Cloud Shell — not the Windows `az` under WSL (avoids
> CRLF and kubeconfig-path issues). The rest of this doc is the manual equivalent.

## How to run the workflow

1. Ensure `Release` has finished for the tag (images `ghcr.io/<owner>/vms-<service>:<tag>` exist).
2. Actions tab → **Deploy to AKS** → **Run workflow** (from `main`).
3. Inputs:

   | Input | Required | Description |
   | --- | --- | --- |
   | `tag` | ✅ | Image tag to deploy — **just the version**, e.g. `v1.2.3` |
   | `dry_run` | — | Render with `helm upgrade --dry-run` instead of applying |

The job runs in the **`production` GitHub Environment**, so any required-reviewer
/ wait-timer rules configured there apply before rollout.

## Authentication — Azure OIDC (no stored secret)

The job logs in with [workload identity federation](https://learn.microsoft.com/azure/active-directory/develop/workload-identity-federation),
so no long-lived password lives in the repo.

**Recommended: a user-assigned managed identity** — works even without Entra
app-registration rights (the platform creates its service principal for you):

```bash
RG=vms-rg CLUSTER=vms-aks
CLUSTER_ID=$(az aks show -g "$RG" -n "$CLUSTER" --query id -o tsv)

# 1. Managed identity
az identity create -g "$RG" -n vms-github-deploy
APP_ID=$(az identity show -g "$RG" -n vms-github-deploy --query clientId -o tsv)
OID=$(az identity show -g "$RG" -n vms-github-deploy --query principalId -o tsv)

# 2. Federated credential trusting this repo's `production` environment
az identity federated-credential create --identity-name vms-github-deploy -g "$RG" \
  --name vms-prod \
  --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:<owner>/<repo>:environment:production" \
  --audiences "api://AzureADTokenExchange"

# 3. AKS roles. The workflow uses the admin kubeconfig (admin: true) because the
#    cluster has Azure RBAC for Kubernetes disabled + local accounts enabled, so
#    the identity needs Cluster Admin Role (and Cluster User Role to fetch creds).
az role assignment create --assignee-object-id "$OID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service Cluster Admin Role" --scope "$CLUSTER_ID"
az role assignment create --assignee-object-id "$OID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service Cluster User Role" --scope "$CLUSTER_ID"
```

`AZURE_CLIENT_ID` = the identity's `clientId`. (An app registration works too;
use its appId — but that path needs Entra rights to create the app + SP.)

> If your cluster *does* have Azure RBAC for Kubernetes enabled, drop `admin: true`
> from `aks-set-context` in the workflow and grant the identity
> `Azure Kubernetes Service RBAC Cluster Admin` instead of the admin role.

## Required configuration (in the `production` Environment)

**Secrets**

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Managed identity (or app) client ID for OIDC login |
| `AZURE_TENANT_ID` | Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Target subscription |
| `AKS_RESOURCE_GROUP` | Resource group containing the cluster |
| `AKS_CLUSTER_NAME` | AKS cluster name |
| `GHCR_PAT` | Classic PAT with `read:packages` — lets the kubelet pull the private GHCR images (omit only if the packages are public) |
| `VMS_JWT_SECRET` | 64-char random — JWT signing key |
| `VMS_INTERNAL_API_KEY` | Inter-service auth key |
| `VMS_POSTGRES_PASSWORD` | Postgres password |
| `VMS_REDIS_PASSWORD` | Redis password |
| `VMS_MINIO_ROOT_USER` | Object-store access key |
| `VMS_MINIO_ROOT_PASSWORD` | Object-store secret key |

**Variables**

| Variable | Example | Purpose |
| --- | --- | --- |
| `AKS_INGRESS_HOST` | `vms.20.0.0.1.nip.io` | Public hostname for the ingress + Environment URL |

`gh` quick-set:
```bash
gh api -X PUT repos/<owner>/<repo>/environments/production
gh secret   set AZURE_CLIENT_ID --env production --repo <owner>/<repo> --body "<clientId>"
# …repeat for the rest…
gh variable set AKS_INGRESS_HOST --env production --repo <owner>/<repo> --body "vms.<ingress-ip>.nip.io"
```

## What the deploy does

1. OIDC login to Azure, then fetches the **admin kubeconfig** (`azure/aks-set-context`, `admin: true`).
2. Ensures the `vms` namespace exists.
3. Creates a `ghcr-pull` docker-registry secret from `GHCR_PAT` and attaches it to
   the namespace's default ServiceAccount (so every pod can pull private images).
   Skipped with a warning if `GHCR_PAT` is unset (works only if packages are public).
4. `helm upgrade --install` with the [`values-aks.yaml`](../deploy/helm/vms/values-aks.yaml)
   overlay, injecting image coordinates, ingress host and secrets via `--set`, and
   `migrations.enabled=false` (see below). `--wait --atomic` auto-rolls-back on failure.
5. Applies the schema by piping [`infrastructure/postgres/init.sql`](../infrastructure/postgres/init.sql)
   into the `postgres-0` pod, then verifies a known table exists.
6. Verifies the `api-gateway` rollout; dumps pod/event diagnostics only on failure.

After the first deploy, seed demo users (password `Passw0rd!`):
```bash
kubectl -n vms exec deploy/auth-service -- node dist/seed.js
```

### Why migrations run from init.sql, not the Helm hook
The chart's migration hook runs the auth-service image expecting
`infrastructure/migrations/data-source.js`, but that file isn't bundled in the
per-service images (each is built from its own `services/<svc>` context). So the
deploy disables the hook (`migrations.enabled=false`) and applies the equivalent
schema from `init.sql` instead.

## Cluster prerequisites

The `values-aks.yaml` overlay assumes the cluster has:

- An **nginx ingress controller** (`ingressClassName: nginx`). Snippet
  annotations are **not** required (the chart's `ingress.serverSnippet` is off in
  this overlay, for hardened controllers that disable snippets).
- The default **`managed-csi`** StorageClass (standard on AKS) for the
  Postgres/MinIO StatefulSets.

The overlay serves the app over **plain HTTP** via a `nip.io` host, so **no DNS or
cert-manager is needed** for a POC. For production:

- Point a real DNS A record at the ingress IP, set `ingress.tls.enabled=true`
  with a cert-manager `letsencrypt-prod` ClusterIssuer, and set
  `AKS_INGRESS_HOST` to that hostname.
- The frontend image bakes its API base at build time; the chart's static-file
  server rewrites it to a relative `/api` path at serve time
  (`API_BASE_REWRITE_FROM/TO`) so calls hit the api-gateway on the same origin.

> Production hardening: the overlay keeps in-cluster Postgres/Redis/MinIO for a
> self-contained deploy. To move to Azure Database for PostgreSQL / Azure Cache
> for Redis / Azure Blob Storage, see the checklist in `deploy/k8s/README.md` and
> switch secret provisioning to the External Secrets Operator (`secrets.create=false`).
> Also review the auth-service login rate-limit: it is per-client-IP, so behind
> the api-gateway all logins may share one bucket unless `X-Forwarded-For` is
> trusted end-to-end.

## Cost control

```bash
az aks stop  -g <rg> -n <cluster>   # deallocates nodes; keeps PVCs + release intact
az aks start -g <rg> -n <cluster>   # workloads come back automatically
```
