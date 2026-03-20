package server

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/agentstack/agentstack/internal/auth"
	"github.com/agentstack/agentstack/internal/config"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
)

// Server holds the HTTP server and its dependencies.
type Server struct {
	cfg          *config.Config
	router       *chi.Mux
	db           *sql.DB
	clickhouseDB *sql.DB
	redis        *redis.Client
	nats         *nats.Conn
	jwtManager   *auth.JWTManager
	apiKeyStore  *auth.APIKeyStore
	logger       *slog.Logger
}

// New creates a new Server instance with all dependencies.
func New(cfg *config.Config, db *sql.DB, redisClient *redis.Client, natsConn *nats.Conn, opts ...func(*Server)) *Server {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	jwtManager := auth.NewJWTManager(cfg.JWTSecret)
	apiKeyStore := auth.NewAPIKeyStore(db)

	s := &Server{
		cfg:         cfg,
		router:      chi.NewRouter(),
		db:          db,
		redis:       redisClient,
		nats:        natsConn,
		jwtManager:  jwtManager,
		apiKeyStore: apiKeyStore,
		logger:      logger,
	}

	// Apply options (e.g., WithClickHouse)
	for _, opt := range opts {
		opt(s)
	}

	s.setupMiddleware()
	s.setupRoutes()

	return s
}

// WithClickHouse returns an option that sets the ClickHouse database connection.
func WithClickHouse(db *sql.DB) func(*Server) {
	return func(s *Server) {
		s.clickhouseDB = db
	}
}

func (s *Server) setupMiddleware() {
	s.router.Use(chimw.RequestID)
	s.router.Use(chimw.RealIP)
	s.router.Use(chimw.Recoverer)
	s.router.Use(chimw.Timeout(30 * time.Second))
	s.router.Use(middleware.CORS(s.cfg.FrontendURL))
	s.router.Use(requestLogger(s.logger))
}

// Run starts the HTTP server and blocks until shutdown.
func (s *Server) Run() error {
	srv := &http.Server{
		Addr:         s.cfg.Addr(),
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		s.logger.Info("server starting", "addr", s.cfg.Addr())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			s.logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-done
	s.logger.Info("server shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return srv.Shutdown(ctx)
}

// SetClickHouseDB sets the ClickHouse database connection for trace queries.
func (s *Server) SetClickHouseDB(db *sql.DB) {
	s.clickhouseDB = db
}

// Router returns the chi router for testing.
func (s *Server) Router() *chi.Mux {
	return s.router
}

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"duration_ms", time.Since(start).Milliseconds(),
				"request_id", chimw.GetReqID(r.Context()),
			)
		})
	}
}

// WriteJSON writes a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	httputil.WriteJSON(w, status, data)
}

// WriteError writes a JSON error response.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	httputil.WriteError(w, status, code, message)
}

// ReadJSON decodes a JSON request body into the given target.
func ReadJSON(r *http.Request, target interface{}) error {
	return httputil.ReadJSON(r, target)
}
