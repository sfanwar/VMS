# AKS Deployment

Deployment to Azure Kubernetes Service is a **standalone, on-demand workflow**
(`.github/workflows/deploy-aks.yml`), separate from the `Release` workflow that
builds and scans images. Run it *after* a release when you want to roll that
version out to the cluster.

```
push tag vX.Y.Z ──► Release (build-and-push + scan-images) ──► images in GHCR
                                                                     │
                          manual run, supply the tag ──► Deploy to AKS (helm upgrade --install)
```

The deploy workflow does **not** build anything — it only deploys images that
the Release workflow already pushed to GHCR for the given tag.

## How to run it

1. Make sure the `Release` workflow has finished for the tag you want (images
   `ghcr.io/<owner>/vms-<service>:<tag>` exist).
2. Actions tab → **Deploy to AKS** → **Run workflow**.
3. Inputs:

   | Input | Required | Description |
   | --- | --- | --- |
   | `tag` | ✅ | Release / image tag to deploy, e.g. `v1.2.3` |
   | `dry_run` | — | Render with `helm upgrade --dry-run` instead of applying |

The job runs in the **`production` GitHub Environment**, so any required-reviewer
/ wait-timer protection rules configured there apply before a release reaches the
cluster.

## Authentication — Azure OIDC (no stored secret)

The job logs in with [workload identity federation](https://learn.microsoft.com/azure/active-directory/develop/workload-identity-federation),
so no long-lived service-principal password lives in the repo. One-time setup:

```bash
# 1. App registration + service principal
az ad app create --display-name vms-github-deploy
APP_ID=$(az ad app list --display-name vms-github-deploy --query '[0].appId' -o tsv)
az ad sp create --id "$APP_ID"

# 2. Federated credential trusting this repo's `production` environment
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "vms-prod",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<owner>/VMS:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 3. Grant the SP rights on the AKS cluster (or its resource group)
az role assignment create --assignee "$APP_ID" \
  --role "Azure Kubernetes Service Cluster User Role" \
  --scope "$(az aks show -g <rg> -n <cluster> --query id -o tsv)"
```

## Required configuration (in the `production` Environment)

**Secrets**

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | App registration (client) ID for OIDC login |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Target subscription |
| `AKS_RESOURCE_GROUP` | Resource group containing the cluster |
| `AKS_CLUSTER_NAME` | AKS cluster name |
| `VMS_JWT_SECRET` | 64-char random — JWT signing key |
| `VMS_INTERNAL_API_KEY` | Inter-service auth key |
| `VMS_POSTGRES_PASSWORD` | Postgres password |
| `VMS_REDIS_PASSWORD` | Redis password |
| `VMS_MINIO_ROOT_USER` | Object-store access key |
| `VMS_MINIO_ROOT_PASSWORD` | Object-store secret key |

**Variables**

| Variable | Example | Purpose |
| --- | --- | --- |
| `AKS_INGRESS_HOST` | `vms.fad.gov.ae` | Public hostname for the ingress + Environment URL |

## What the deploy does

1. OIDC login to Azure and pulls the cluster's kubeconfig (`azure/aks-set-context`).
2. Ensures the `vms` namespace exists.
3. Creates/refreshes a `ghcr-pull` docker-registry secret and attaches it to the
   namespace's default ServiceAccount (so the pre-upgrade migration Job can pull
   private GHCR images).
4. Runs `helm upgrade --install` with the [`values-aks.yaml`](../deploy/helm/vms/values-aks.yaml)
   overlay, injecting the release tag, image repository, ingress host and secrets
   via `--set`. The DB migration Job runs as a Helm pre-upgrade hook.
5. `--wait --atomic` — a failed rollout is **automatically rolled back** to the
   previous release.
6. Verifies the `api-gateway` rollout and dumps diagnostics on failure.

## Cluster prerequisites

The `values-aks.yaml` overlay assumes the cluster already has:

- An **nginx ingress controller** (`ingressClassName: nginx`).
- **cert-manager** with a `letsencrypt-prod` ClusterIssuer (for `vms-tls`).
- The default `managed-csi` StorageClass (standard on AKS) for the Postgres/MinIO
  StatefulSets.

> Production hardening: the overlay keeps in-cluster Postgres/Redis/MinIO for a
> self-contained deploy. To move to Azure Database for PostgreSQL / Azure Cache
> for Redis / Azure Blob Storage, see the hardening checklist in
> `deploy/k8s/README.md` and switch secret provisioning to the External Secrets
> Operator (`secrets.create=false`).
