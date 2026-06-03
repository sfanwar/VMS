#!/usr/bin/env bash
# Run the NestJS services' unit tests on the host.
#
# Why host and not `docker compose exec`: the runtime images are built with
# `npm prune --omit=dev` and don't copy the test/ dir, so jest is not present
# inside the containers. This mirrors how .github/workflows/ci.yml runs tests.
#
# Usage:
#   scripts/test.sh                     # all services
#   scripts/test.sh request-service     # one or more named services
#   scripts/test.sh --coverage          # with coverage
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

COV=0
SERVICES=()
for arg in "$@"; do
  case "$arg" in
    --coverage|-c) COV=1 ;;
    *) SERVICES+=("$arg") ;;
  esac
done
if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=(auth-service user-service request-service workflow-service)
fi

BLUE='\033[36m'; GREEN='\033[32m'; RED='\033[31m'; RESET='\033[0m'
FAILED=()
for svc in "${SERVICES[@]}"; do
  dir="services/$svc"
  if [ ! -d "$dir" ]; then
    echo -e "${RED}✗ unknown service: $svc${RESET}"; FAILED+=("$svc"); continue
  fi
  echo -e "${BLUE}→ Testing $svc${RESET}"
  (
    cd "$dir" || exit 1
    [ -d node_modules ] || npm install --no-audit --no-fund --silent
    if [ "$COV" -eq 1 ]; then npm run test:cov; else npm test; fi
  ) || FAILED+=("$svc")
done

if [ ${#FAILED[@]} -ne 0 ]; then
  echo -e "${RED}✗ Failed: ${FAILED[*]}${RESET}"; exit 1
fi
echo -e "${GREEN}✓ All test suites passed${RESET}"
