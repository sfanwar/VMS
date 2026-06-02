# VMS Helm Chart

Production-ready chart for the Visa Management System.

## Install

```bash
# Create the namespace separately (Helm doesn't manage it by design)
kubectl create namespace vms

# Lint
helm lint deploy/helm/vms

# Install with overridden values
helm install vms deploy/helm/vms \
  --namespace vms \
  --set global.imageRepository=myorg/vms \
  --set global.imageTag=v1.0.0 \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set secrets.postgresPassword="$(openssl rand -hex 16)" \
  --set secrets.redisPassword="$(openssl rand -hex 16)" \
  --set secrets.minioRootPassword="$(openssl rand -hex 16)" \
  --set ingress.host=vms.example.gov

# Upgrade in-place
helm upgrade vms deploy/helm/vms --namespace vms --reuse-values --set global.imageTag=v1.1.0
```

## Production overrides — `values-prod.yaml`

```yaml
global:
  imageRepository: prod-registry.gov/vms
  imageTag: v1.0.0

# Use managed services
postgres: { enabled: false }
redis:    { enabled: false }
minio:    { enabled: false }
mailhog:  { enabled: false }

# External Secrets Operator handles credentials
secrets:  { create: false }

# Scale up
services:
  gateway:  { replicas: 5 }
  workflow: { replicas: 5 }

# Production ingress
ingress:
  host: vms.fad.gov.ae
  tls:
    issuer: corporate-ca

# HPA
autoscaling:
  enabled: true
  maxReplicas: 20
```

Then:

```bash
helm install vms deploy/helm/vms -n vms -f values-prod.yaml
```

## Uninstall

```bash
helm uninstall vms -n vms
# PVCs (StatefulSets) are retained — delete manually if intended
kubectl -n vms delete pvc -l app=postgres
kubectl -n vms delete pvc -l app=minio
```

## Production gotchas

- **First-time install runs the migration Job before service pods start** (Helm pre-install hook). On a failure the Job's logs are your starting point: `kubectl -n vms logs job/vms-migrate-1`.
- **Secrets:** `secrets.create: true` is for bootstrapping only. Production must use an external secret manager + the External Secrets Operator. Set `create: false` and provision `vms-secrets` separately.
- **Images:** the chart assumes `ghcr.io/<owner>/vms-<service>:<tag>` naming. Override `global.imageRepository` to match your registry layout.
- **Ingress:** if you're not using nginx, override `ingress.className` and re-check the `server-snippet` annotation. The `/internal/` 404 block is nginx-specific.
