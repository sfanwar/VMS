{{/*
Common labels shared by every resource.
*/}}
{{- define "vms.labels" -}}
app.kubernetes.io/name: {{ .name | quote }}
app.kubernetes.io/instance: {{ $.Release.Name | quote }}
app.kubernetes.io/managed-by: {{ $.Release.Service | quote }}
app.kubernetes.io/version: {{ $.Chart.AppVersion | quote }}
helm.sh/chart: {{ printf "%s-%s" $.Chart.Name $.Chart.Version | replace "+" "_" | quote }}
{{- end -}}

{{/*
Image reference for a service. Pass `.svc` as the service map and `$` as the root context.
*/}}
{{- define "vms.image" -}}
{{- $registry := $.Values.global.imageRegistry -}}
{{- $repo := $.Values.global.imageRepository -}}
{{- $tag := $.Values.global.imageTag -}}
{{- printf "%s/%s-%s:%s" $registry $repo .name $tag -}}
{{- end -}}

{{/*
Frontend image (different repo suffix).
*/}}
{{- define "vms.frontendImage" -}}
{{- printf "%s/%s-frontend:%s" .Values.global.imageRegistry .Values.global.imageRepository .Values.global.imageTag -}}
{{- end -}}

{{/*
Container security context block.
*/}}
{{- define "vms.containerSecurityContext" -}}
allowPrivilegeEscalation: {{ .Values.global.containerSecurityContext.allowPrivilegeEscalation }}
readOnlyRootFilesystem: {{ .Values.global.containerSecurityContext.readOnlyRootFilesystem }}
capabilities:
  drop:
  {{- range .Values.global.containerSecurityContext.capabilities.drop }}
    - {{ . }}
  {{- end }}
{{- end -}}
