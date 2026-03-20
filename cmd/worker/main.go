package main

import (
	"context"
	"database/sql"
	"log"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/agentstack/agentstack/internal/config"
	teststore "github.com/agentstack/agentstack/internal/test/store"
	"github.com/agentstack/agentstack/internal/worker"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	logger.Info("worker starting", "environment", cfg.Environment)

	// Connect to PostgreSQL
	pgDB, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to open postgres: %v", err)
	}
	defer pgDB.Close()

	pgDB.SetMaxOpenConns(10)
	pgDB.SetMaxIdleConns(5)
	pgDB.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := pgDB.PingContext(ctx); err != nil {
		log.Fatalf("failed to ping postgres: %v", err)
	}
	logger.Info("connected to PostgreSQL")

	// Connect to ClickHouse via database/sql (native protocol)
	chDB, err := sql.Open("clickhouse", cfg.ClickhouseURL)
	if err != nil {
		log.Fatalf("failed to open clickhouse: %v", err)
	}
	defer chDB.Close()

	chDB.SetMaxOpenConns(10)
	chDB.SetMaxIdleConns(5)

	ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel2()
	if err := chDB.PingContext(ctx2); err != nil {
		logger.Warn("ClickHouse not available, ingest writer will retry", "error", err)
	} else {
		logger.Info("connected to ClickHouse")
	}

	// Connect to Redis
	redisOpt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to parse redis URL: %v", err)
	}
	redisClient := redis.NewClient(redisOpt)
	defer redisClient.Close()

	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		logger.Warn("Redis not available", "error", err)
	} else {
		logger.Info("connected to Redis")
	}

	// Connect to NATS
	natsConn, err := nats.Connect(cfg.NatsURL,
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(30),
		nats.ReconnectWait(2*time.Second),
	)
	if err != nil {
		log.Fatalf("failed to connect to NATS: %v", err)
	}
	defer natsConn.Close()
	logger.Info("connected to NATS")

	// Start ingest writer
	ingestWriter := worker.NewIngestWriter(natsConn, chDB, logger.With("worker", "ingest_writer"))
	if err := ingestWriter.Start(); err != nil {
		log.Fatalf("failed to start ingest writer: %v", err)
	}

	// Start pattern matcher
	patternMatcher := worker.NewPatternMatcher(chDB, pgDB, logger.With("worker", "pattern_matcher"))
	patternMatcher.Start()

	// Start alert evaluator
	alertEvaluator := worker.NewAlertEvaluator(chDB, pgDB, logger.With("worker", "alert_evaluator"))
	alertEvaluator.Start()

	// Start budget checker (every 60 seconds)
	budgetChecker := worker.NewBudgetChecker(pgDB, logger.With("worker", "budget_checker"))
	budgetChecker.Start()

	// Start cache cleanup (every 5 minutes)
	cacheCleanup := worker.NewCacheCleanup(pgDB, logger.With("worker", "cache_cleanup"))
	cacheCleanup.Start()

	// Start test executor (async test run execution via NATS)
	testPgStore := teststore.NewPostgresStore(pgDB)
	testExecutor := worker.NewTestExecutor(natsConn, testPgStore, logger.With("worker", "test_executor"))
	if err := testExecutor.Start(); err != nil {
		log.Fatalf("failed to start test executor: %v", err)
	}

	// Start webhook sender (async webhook delivery via NATS)
	webhookSender := worker.NewWebhookSender(natsConn, pgDB, logger.With("worker", "webhook_sender"))
	if err := webhookSender.Start(); err != nil {
		log.Fatalf("failed to start webhook sender: %v", err)
	}

	logger.Info("all workers started")

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	logger.Info("shutting down workers", "signal", sig.String())

	ingestWriter.Stop()
	patternMatcher.Stop()
	alertEvaluator.Stop()
	budgetChecker.Stop()
	cacheCleanup.Stop()
	testExecutor.Stop()
	webhookSender.Stop()

	logger.Info("all workers stopped cleanly")
}
