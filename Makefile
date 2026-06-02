# ─────────────────────────────────────────────────────────
# Visa Management System — developer Makefile
#
# Usage: `make <target>` (or `make` for help).
# ─────────────────────────────────────────────────────────

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Colors
BLUE   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RESET  := \033[0m

# ─── Help ────────────────────────────────────────────────

help: ## Show this help
	@echo ""
	@echo "$(BLUE)Visa Management System$(RESET) — developer commands"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  $(GREEN)%-22s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST) | sort
	@echo ""

# ─── Lifecycle ───────────────────────────────────────────

up: ## Bring the full stack up (build if needed)
	docker-compose up -d --build

down: ## Stop everything
	docker-compose down

reset: ## Stop, remove volumes (destroys data), rebuild
	docker-compose down -v
	docker-compose up -d --build

logs: ## Tail logs for all services
	docker-compose logs -f --tail=100

ps: ## Show running containers
	docker-compose ps

# ─── Seed & sample data ──────────────────────────────────

seed: ## Seed test users (5 personas, password Passw0rd!)
	docker-compose exec auth-service npm run seed

seed-sample: ## Seed realistic sample requests (depends on `seed` first)
	@echo "$(YELLOW)→ Generating sample requests…$(RESET)"
	docker-compose exec auth-service node /app/dist/sample-data.js || \
	  (echo "$(YELLOW)Sample script not yet built into image — running via host node$(RESET)" && \
	   cd services/auth-service && npx ts-node src/sample-data.ts)

# ─── Tests ───────────────────────────────────────────────

test: ## Run all unit tests across services
	@for svc in auth-service user-service request-service workflow-service; do \
		echo "$(BLUE)→ Testing $$svc$(RESET)"; \
		docker-compose exec -T $$svc npm test || exit 1; \
	done

test-cov: ## Run all tests with coverage
	@for svc in auth-service user-service request-service workflow-service; do \
		echo "$(BLUE)→ Coverage for $$svc$(RESET)"; \
		docker-compose exec -T $$svc npm run test:cov || exit 1; \
	done

test-e2e: ## Run end-to-end Playwright tests (requires `up` first)
	cd e2e && npm install && npm test

# ─── Service shortcuts ───────────────────────────────────

auth-logs:        ## Tail auth-service logs
	docker-compose logs -f auth-service
user-logs:        ## Tail user-service logs
	docker-compose logs -f user-service
request-logs:     ## Tail request-service logs
	docker-compose logs -f request-service
workflow-logs:    ## Tail workflow-service logs
	docker-compose logs -f workflow-service
document-logs:    ## Tail document-service logs
	docker-compose logs -f document-service
gateway-logs:     ## Tail api-gateway logs
	docker-compose logs -f api-gateway

# ─── Database ────────────────────────────────────────────

psql: ## Open psql in the postgres container
	docker-compose exec postgres psql -U visa_admin -d visa_management

db-shell: psql

db-migrate: ## Run pending DB migrations
	docker-compose exec auth-service npx typeorm migration:run -d /app/infrastructure/migrations/data-source.ts || \
	  (cd infrastructure/migrations && npx typeorm migration:run -d data-source.ts)

db-migrate-show: ## Show migration status
	cd infrastructure/migrations && npx typeorm migration:show -d data-source.ts

db-migrate-revert: ## Revert the last migration
	cd infrastructure/migrations && npx typeorm migration:revert -d data-source.ts

# ─── Utilities ───────────────────────────────────────────

swagger: ## Open Swagger UI URLs in your browser
	@echo "Swagger UIs:"
	@echo "  Auth:          http://localhost:3001/api/docs"
	@echo "  Users:         http://localhost:3002/api/docs"
	@echo "  Requests:      http://localhost:3003/api/docs"
	@echo "  Workflow:      http://localhost:3004/api/docs"
	@echo "  Documents:     http://localhost:3005/api/docs"
	@echo "  Notifications: http://localhost:3006/api/docs"
	@echo "  Reporting:     http://localhost:3007/api/docs"
	@echo ""
	@echo "Other UIs:"
	@echo "  Frontend:      http://localhost:5173"
	@echo "  MailHog:       http://localhost:8025"
	@echo "  MinIO:         http://localhost:9001 (minioadmin / minioadmin)"

mailhog: ## Open MailHog inbox
	@open http://localhost:8025 2>/dev/null || xdg-open http://localhost:8025 2>/dev/null || echo "http://localhost:8025"

minio: ## Open MinIO console
	@open http://localhost:9001 2>/dev/null || xdg-open http://localhost:9001 2>/dev/null || echo "http://localhost:9001"

front: ## Open the frontend
	@open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null || echo "http://localhost:5173"

health: ## Curl every service's /health
	@for port in 3000 3001 3002 3003 3004 3005 3006 3007; do \
		echo -n "  port $$port: "; \
		curl -s -m 2 http://localhost:$$port/health | head -c 200; \
		echo ""; \
	done

clean: ## Remove node_modules from every service (forces fresh install on next build)
	find services -name node_modules -type d -prune -exec rm -rf {} +
	rm -rf frontend/node_modules
	@echo "$(GREEN)✓ Cleaned$(RESET)"

.PHONY: help up down reset logs ps seed seed-sample test test-cov test-e2e \
        auth-logs user-logs request-logs workflow-logs document-logs gateway-logs \
        psql db-shell db-migrate db-migrate-show db-migrate-revert \
        swagger mailhog minio front health clean
