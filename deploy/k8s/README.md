# Kubernetes Manifests

Raw YAML for deploying VMS to any Kubernetes cluster (≥1.27). For templated, environment-aware deployment, prefer the Helm chart at `../helm/vms/`.

## Order of operations

```bash
# 1. Populate the secret (NEVER commit real values)
cp 00-namespace.yaml /tmp/00-namespace.yaml
$EDITOR /tmp/00-namespace.yaml          # replace REPLACE-WITH-* values

# 2. Apply in order
kubectl apply -f /tmp/00-namespace.yaml
kubectl apply -f 10-postgres.yaml
kubectl apply -f 11-redis.yaml
kubectl apply -f 12-minio.yaml

# 3. Wait for infra to be ready
kubectl -n vms wait --for=condition=ready pod -l app=postgres --timeout=300s

# 4. Run DB migrations (run once before service rollout)
kubectl -n vms run vms-migrate --rm -it --restart=Never \
  --image=ghcr.io/<owner>/vms-auth-service:latest \
  --env-from=secretRef/vms-secrets \
  -- node infrastructure/migrations/data-source.js

# 5. Deploy services
kubectl apply -f 20-auth-service.yaml
kubectl apply -f 21-user-service.yaml
kubectl apply -f 22-request-service.yaml
kubectl apply -f 23-workflow-service.yaml
kubectl apply -f 24-document-service.yaml
kubectl apply -f 25-notification-service.yaml
kubectl apply -f 26-api-gateway.yaml
kubectl apply -f 27-reporting-service.yaml
kubectl apply -f 28-frontend.yaml

# 6. Ingress + network policies (last; closes off external access correctly)
kubectl apply -f 30-ingress.yaml
kubectl apply -f 31-network-policies.yaml
```

## Production hardening checklist

- Replace embedded Postgres with managed RDS / Cloud SQL — delete `10-postgres.yaml`, point `DATABASE_URL` at the external host
- Replace MinIO with S3 / Azure Blob — delete `12-minio.yaml`
- Delete `13-mailhog.yaml` entirely; point `SMTP_HOST` at a real relay
- Replace `vms-secrets` with External Secrets Operator pulling from Vault / AWS SM / Azure Key Vault
- Replace `ghcr.io/REPLACE-OWNER/` prefix with your registry path
- Set up `cert-manager` ClusterIssuer (`letsencrypt-prod` or internal CA)
- Set up `HorizontalPodAutoscaler` for the gateway + workflow-service (high-traffic)
- Enable PodDisruptionBudgets for graceful node drains
- Add `Pod Security Standards` baseline enforcement at namespace level
- Audit log: ensure cluster audit policy logs `vms` namespace operations
