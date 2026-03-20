package main

import (
	"context"
	"database/sql"
	"log"
	"log/slog"
	"os"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/agentstack/agentstack/internal/config"
	"github.com/agentstack/agentstack/internal/server"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Connect to PostgreSQL
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to postgres: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("failed to ping postgres: %v", err)
	}
	logger.Info("connected to PostgreSQL")

	// Connect to Redis
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to parse redis URL: %v", err)
	}
	redisClient := redis.NewClient(opt)
	defer redisClient.Close()

	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		logger.Warn("redis not available, rate limiting disabled", "error", err)
		redisClient = nil
	} else {
		logger.Info("connected to Redis")
	}

	// Connect to NATS
	natsConn, err := nats.Connect(cfg.NatsURL,
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(10),
		nats.ReconnectWait(2*time.Second),
	)
	if err != nil {
		logger.Warn("NATS not available, async ingestion disabled", "error", err)
	} else {
		defer natsConn.Close()
		logger.Info("connected to NATS")
	}

	// Connect to ClickHouse via native protocol (same as worker)
	var chDB *sql.DB
	if cfg.ClickhouseURL != "" {
		chDB, err = sql.Open("clickhouse", cfg.ClickhouseURL)
		if err != nil {
			logger.Warn("ClickHouse connection failed, session/analytics features disabled", "error", err)
			chDB = nil
		} else {
			chCtx, chCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer chCancel()
			if pingErr := chDB.PingContext(chCtx); pingErr != nil {
				logger.Warn("ClickHouse ping failed, session/analytics features disabled", "error", pingErr)
				chDB.Close()
				chDB = nil
			} else {
				defer chDB.Close()
				logger.Info("connected to ClickHouse")
			}
		}
	}

	// Create and run server
	var opts []func(*server.Server)
	if chDB != nil {
		opts = append(opts, server.WithClickHouse(chDB))
	}
	srv := server.New(cfg, db, redisClient, natsConn, opts...)
	logger.Info("starting AgentStack API server", "port", cfg.Port)
	if err := srv.Run(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
