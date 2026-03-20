package main

import (
	"context"
	"database/sql"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/agentstack/agentstack/internal/config"
	costservice "github.com/agentstack/agentstack/internal/cost/service"
	coststore "github.com/agentstack/agentstack/internal/cost/store"
	"github.com/agentstack/agentstack/internal/route/gateway"
	"github.com/agentstack/agentstack/internal/route/service"
	"github.com/agentstack/agentstack/internal/route/store"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
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
		Level: slog.LevelInfo,
	}))

	// Connect to PostgreSQL
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to PostgreSQL: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	if err := db.PingContext(context.Background()); err != nil {
		logger.Warn("PostgreSQL not available at startup, will retry", "error", err)
	}

	// Connect to Redis
	var redisClient *redis.Client
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err == nil {
		redisClient = redis.NewClient(opt)
		if err := redisClient.Ping(context.Background()).Err(); err != nil {
			logger.Warn("Redis not available at startup", "error", err)
			redisClient = nil
		}
	} else {
		logger.Warn("invalid Redis URL", "error", err)
	}

	// Connect to NATS
	var natsConn *nats.Conn
	natsConn, err = nats.Connect(cfg.NatsURL)
	if err != nil {
		logger.Warn("NATS not available at startup", "error", err)
	}

	// Initialize services
	s := store.New(db)

	encSvc, err := service.NewEncryption(cfg.EncryptionKey)
	if err != nil {
		logger.Warn("encryption service not available, using random key", "error", err)
		encSvc, _ = service.NewEncryption("")
	}

	// Build gateway components
	router := gateway.NewRouter(s, encSvc, logger)
	cache := gateway.NewSemanticCache(redisClient, s, time.Hour)
	fallback := gateway.NewFallbackExecutor(router, logger)
	asyncLogger := gateway.NewAsyncLogger(natsConn, s, logger)
	proxy := gateway.NewProxy(router, cache, fallback, asyncLogger, logger)

	// Initialize cost module services for budget enforcement and cost tracking
	costPG := coststore.NewPostgresStore(db)
	budgetSvc := costservice.NewBudgetService(costPG, logger)
	costTracker := costservice.NewTrackerService(costPG, logger)
	proxy.SetBudgetService(budgetSvc)
	proxy.SetCostTracker(costTracker)

	// Set up HTTP router
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-AgentStack-Org-ID", "X-AgentStack-Feature", "X-AgentStack-Customer", "X-AgentStack-Cache"},
		ExposedHeaders:   []string{"X-AgentStack-Request-ID", "X-AgentStack-Provider", "X-AgentStack-Model", "X-AgentStack-Cache-Hit", "X-AgentStack-Budget-Warning"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy","service":"gateway"}`))
	})

	// OpenAI-compatible endpoints
	r.Post("/v1/chat/completions", proxy.HandleChatCompletion)
	r.Post("/v1/embeddings", proxy.HandleEmbeddings)

	// Start server
	srv := &http.Server{
		Addr:         cfg.GatewayAddr(),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 120 * time.Second, // long timeout for streaming
		IdleTimeout:  60 * time.Second,
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		logger.Info("gateway proxy starting", "addr", cfg.GatewayAddr())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("gateway server error: %v", err)
		}
	}()

	<-done
	logger.Info("gateway shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Clean up
	asyncLogger.Stop()
	router.Stop()
	if natsConn != nil {
		natsConn.Close()
	}
	srv.Shutdown(ctx)
}
