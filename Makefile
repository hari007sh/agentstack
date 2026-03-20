.PHONY: dev build test migrate seed clean gateway worker

# Development
dev:
	go run ./cmd/server/main.go

gateway:
	go run ./cmd/gateway/main.go

worker:
	go run ./cmd/worker/main.go

# Build
build:
	go build -o bin/server ./cmd/server
	go build -o bin/gateway ./cmd/gateway
	go build -o bin/worker ./cmd/worker
	go build -o bin/migrate ./cmd/migrate
	go build -o bin/cli ./cmd/cli

# Test
test:
	go test ./... -v -count=1

test-cover:
	go test ./... -cover -coverprofile=coverage.out
	go tool cover -html=coverage.out -o coverage.html

# Database
migrate:
	go run ./cmd/migrate/main.go

migrate-down:
	go run ./cmd/migrate/main.go -direction=down

# Seed
seed:
	go run ./cmd/migrate/main.go -seed

# Docker
docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-reset:
	docker compose down -v
	docker compose up -d

# Lint
lint:
	golangci-lint run ./...
	go vet ./...

# Clean
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

# All-in-one dev setup
setup: docker-up
	@echo "Waiting for services to be healthy..."
	@sleep 10
	$(MAKE) migrate
	$(MAKE) seed
	@echo "Setup complete. Run 'make dev' to start the server."
