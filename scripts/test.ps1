<#
.SYNOPSIS
  Run the NestJS services' unit tests on the host (Windows-friendly).

.DESCRIPTION
  Tests run on the host rather than via `docker compose exec` because the
  runtime images are built with `npm prune --omit=dev` and don't ship the
  test/ dir, so jest is unavailable inside the containers. Dev dependencies
  are installed per service on first run. Mirrors .github/workflows/ci.yml.

.EXAMPLE
  ./scripts/test.ps1                  # all services
.EXAMPLE
  ./scripts/test.ps1 request-service  # one or more named services
.EXAMPLE
  ./scripts/test.ps1 -Coverage        # with coverage
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Service,
  [switch]$Coverage
)

$root = Split-Path -Parent $PSScriptRoot
$all = @('auth-service', 'user-service', 'request-service', 'workflow-service')
$targets = if ($Service) { $Service } else { $all }

$failed = @()
foreach ($svc in $targets) {
  $dir = Join-Path $root "services/$svc"
  if (-not (Test-Path $dir)) {
    Write-Host "X unknown service: $svc" -ForegroundColor Red
    $failed += $svc; continue
  }
  Write-Host "-> Testing $svc" -ForegroundColor Cyan
  Push-Location $dir
  try {
    if (-not (Test-Path 'node_modules')) {
      npm install --no-audit --no-fund --silent
      if ($LASTEXITCODE -ne 0) { $failed += $svc; continue }
    }
    if ($Coverage) { npm run test:cov } else { npm test }
    if ($LASTEXITCODE -ne 0) { $failed += $svc }
  }
  finally {
    Pop-Location
  }
}

if ($failed.Count) {
  Write-Host "X Failed: $($failed -join ', ')" -ForegroundColor Red
  exit 1
}
Write-Host "OK All test suites passed" -ForegroundColor Green
