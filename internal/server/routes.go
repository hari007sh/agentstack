package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/agentstack/agentstack/internal/auth"
	costhandler "github.com/agentstack/agentstack/internal/cost/handler"
	costservice "github.com/agentstack/agentstack/internal/cost/service"
	coststore "github.com/agentstack/agentstack/internal/cost/store"
	datasethandler "github.com/agentstack/agentstack/internal/dataset/handler"
	datasetservice "github.com/agentstack/agentstack/internal/dataset/service"
	datasetstore "github.com/agentstack/agentstack/internal/dataset/store"
	guardhandler "github.com/agentstack/agentstack/internal/guard/handler"
	guardservice "github.com/agentstack/agentstack/internal/guard/service"
	guardstore "github.com/agentstack/agentstack/internal/guard/store"
	otelhandler "github.com/agentstack/agentstack/internal/otel/handler"
	otelservice "github.com/agentstack/agentstack/internal/otel/service"
	prompthandler "github.com/agentstack/agentstack/internal/prompt/handler"
	promptservice "github.com/agentstack/agentstack/internal/prompt/service"
	promptstore "github.com/agentstack/agentstack/internal/prompt/store"
	routehandler "github.com/agentstack/agentstack/internal/route/handler"
	routeservice "github.com/agentstack/agentstack/internal/route/service"
	routestore "github.com/agentstack/agentstack/internal/route/store"
	"github.com/agentstack/agentstack/internal/server/middleware"
	shieldhandler "github.com/agentstack/agentstack/internal/shield/handler"
	shieldservice "github.com/agentstack/agentstack/internal/shield/service"
	shieldstore "github.com/agentstack/agentstack/internal/shield/store"
	testhandler "github.com/agentstack/agentstack/internal/test/handler"
	testservice "github.com/agentstack/agentstack/internal/test/service"
	teststore "github.com/agentstack/agentstack/internal/test/store"
	tracehandler "github.com/agentstack/agentstack/internal/trace/handler"
	"github.com/agentstack/agentstack/internal/trace/service"
	"github.com/agentstack/agentstack/internal/trace/store"
	webhookhandler "github.com/agentstack/agentstack/internal/webhook/handler"
	webhookservice "github.com/agentstack/agentstack/internal/webhook/service"
	webhookstore "github.com/agentstack/agentstack/internal/webhook/store"
	"github.com/go-chi/chi/v5"
)

func (s *Server) setupRoutes() {
	// Health check — unauthenticated
	s.router.Get("/health", s.handleHealth)
	s.router.Get("/ready", s.handleReady)

	// Auth routes — unauthenticated
	s.router.Route("/auth", func(r chi.Router) {
		r.Post("/github", s.handleGitHubLogin)
		r.Get("/github/callback", s.handleGitHubCallback)
	})

	// --- Build trace module dependencies ---
	pgStore := store.NewPostgresStore(s.db)
	var chStore *store.ClickHouseStore
	if s.clickhouseDB != nil {
		chStore = store.NewClickHouseStore(s.clickhouseDB)
	}

	ingestSvc := service.NewIngestService(s.nats, s.logger)

	var sessionSvc *service.SessionService
	var analyticsSvc *service.AnalyticsService
	if chStore != nil {
		sessionSvc = service.NewSessionService(chStore, s.logger)
		analyticsSvc = service.NewAnalyticsService(chStore, s.logger)
	}

	patternSvc := service.NewPatternService(pgStore, s.logger)
	alertSvc := service.NewAlertService(pgStore, s.logger)

	ingestHandler := tracehandler.NewIngestHandler(ingestSvc, s.logger)
	agentHandler := tracehandler.NewAgentHandler(pgStore, s.logger)
	patternHandler := tracehandler.NewPatternHandler(patternSvc, s.logger)
	alertHandler := tracehandler.NewAlertHandler(alertSvc, s.logger)

	var sessionHandler *tracehandler.SessionHandler
	var analyticsHandler *tracehandler.AnalyticsHandler
	if sessionSvc != nil {
		sessionHandler = tracehandler.NewSessionHandler(sessionSvc, s.logger)
	}
	if analyticsSvc != nil {
		analyticsHandler = tracehandler.NewAnalyticsHandler(analyticsSvc, s.logger)
	}

	// --- Build shield module dependencies ---
	var shieldChStore *shieldstore.ClickHouseStore
	if s.clickhouseDB != nil {
		shieldChStore = shieldstore.NewClickHouseStore(s.clickhouseDB)
	}

	healingSvc := shieldservice.NewHealingService(s.nats, shieldChStore, s.logger)
	healingHandler := shieldhandler.NewHealingHandler(healingSvc, s.logger)

	// API v1 routes — authenticated via JWT (dashboard) or API key (SDKs)
	s.router.Route("/v1", func(r chi.Router) {
		r.Use(middleware.DualAuth(s.jwtManager, s.apiKeyStore))

		// Rate limiting
		if s.redis != nil {
			limiter := middleware.NewRateLimiter(s.redis, 1000, time.Minute)
			r.Use(limiter.Middleware())
		}

		// Trace module: Ingestion routes
		r.Route("/ingest", func(r chi.Router) {
			r.Post("/sessions", ingestHandler.IngestSession)
			r.Post("/spans", ingestHandler.IngestSpans)
			r.Post("/events", ingestHandler.IngestEvents)
			r.Post("/batch", ingestHandler.IngestBatch)

			// Shield module: Healing event ingestion
			r.Post("/healing", healingHandler.IngestHealing)
		})

		// Trace module: Session query routes
		r.Route("/sessions", func(r chi.Router) {
			if sessionHandler != nil {
				r.Get("/", sessionHandler.ListSessions)
				r.Get("/{id}", sessionHandler.GetSession)
				r.Get("/{id}/spans", sessionHandler.GetSessionSpans)
				r.Get("/{id}/events", sessionHandler.GetSessionEvents)
			}

			// Shield module: Healing events per session
			r.Get("/{id}/healing", healingHandler.GetSessionHealing)
		})

		// Trace module: Analytics routes
		r.Route("/analytics", func(r chi.Router) {
			if analyticsHandler != nil {
				r.Get("/overview", analyticsHandler.Overview)
				r.Get("/sessions-over-time", analyticsHandler.SessionsOverTime)
				r.Get("/failure-rate", analyticsHandler.FailureRate)
			}

			// Shield module: Healing analytics
			r.Get("/healing", healingHandler.HealingAnalytics)
		})

		// Trace module: Agent definitions CRUD
		r.Route("/agents", func(r chi.Router) {
			r.Get("/", agentHandler.List)
			r.Post("/", agentHandler.Create)
			r.Get("/{id}", agentHandler.Get)
			r.Put("/{id}", agentHandler.Update)
			r.Delete("/{id}", agentHandler.Delete)
		})

		// Trace module: Failure patterns CRUD
		r.Route("/patterns", func(r chi.Router) {
			r.Get("/", patternHandler.List)
			r.Post("/", patternHandler.Create)
			r.Get("/{id}", patternHandler.Get)
			r.Put("/{id}", patternHandler.Update)
			r.Delete("/{id}", patternHandler.Delete)
		})

		// Trace module: Alert rules CRUD
		r.Route("/alerts", func(r chi.Router) {
			r.Get("/", alertHandler.List)
			r.Post("/", alertHandler.Create)
			r.Get("/{id}", alertHandler.Get)
			r.Put("/{id}", alertHandler.Update)
			r.Delete("/{id}", alertHandler.Delete)
		})

		// --- Build test module dependencies ---
		testPgStore := teststore.NewPostgresStore(s.db)
		evalSvc := testservice.NewEvaluatorService(s.logger, nil)
		runnerSvc := testservice.NewRunnerService(testPgStore, evalSvc, s.logger)

		suiteHandler := testhandler.NewSuiteHandler(testPgStore, s.logger)
		caseHandler := testhandler.NewCaseHandler(testPgStore, s.logger)
		runHandler := testhandler.NewRunHandler(testPgStore, runnerSvc, s.nats, s.logger)
		evaluatorHandler := testhandler.NewEvaluatorHandler(testPgStore, s.logger)

		// Test module routes
		r.Route("/test", func(r chi.Router) {
			// Test suites CRUD
			r.Route("/suites", func(r chi.Router) {
				r.Get("/", suiteHandler.List)
				r.Post("/", suiteHandler.Create)
				r.Get("/{id}", suiteHandler.Get)
				r.Put("/{id}", suiteHandler.Update)
				r.Delete("/{id}", suiteHandler.Delete)

				// Test cases within a suite
				r.Get("/{suiteId}/cases", caseHandler.List)
				r.Post("/{suiteId}/cases", caseHandler.Create)

				// Start a test run for a suite
				r.Post("/{suiteId}/run", runHandler.StartRun)
			})

			// Test cases (direct access by ID)
			r.Route("/cases", func(r chi.Router) {
				r.Get("/{id}", caseHandler.Get)
				r.Put("/{id}", caseHandler.Update)
				r.Delete("/{id}", caseHandler.Delete)
			})

			// Test runs
			r.Route("/runs", func(r chi.Router) {
				r.Get("/", runHandler.List)
				r.Get("/{id}", runHandler.Get)
			})

			// Evaluators CRUD
			r.Route("/evaluators", func(r chi.Router) {
				r.Get("/", evaluatorHandler.List)
				r.Post("/", evaluatorHandler.Create)
				r.Get("/{id}", evaluatorHandler.Get)
				r.Put("/{id}", evaluatorHandler.Update)
				r.Delete("/{id}", evaluatorHandler.Delete)
			})

			// CI/CD endpoint
			r.Post("/ci/run", runHandler.CIRun)
		})

		// --- Build guard module dependencies ---
		guardPgStore := guardstore.NewPostgresStore(s.db)
		guardEngine := guardservice.NewEngine(guardPgStore, s.logger)

		rulesHandler := guardhandler.NewRulesHandler(guardPgStore, s.logger)
		checkHandler := guardhandler.NewCheckHandler(guardEngine, guardPgStore, s.logger)
		eventsHandler := guardhandler.NewEventsHandler(guardPgStore, s.logger)

		// Guard module routes
		r.Route("/guard", func(r chi.Router) {
			// Guardrail rules CRUD
			r.Route("/rules", func(r chi.Router) {
				r.Get("/", rulesHandler.List)
				r.Post("/", rulesHandler.Create)
				r.Get("/{id}", rulesHandler.Get)
				r.Put("/{id}", rulesHandler.Update)
				r.Delete("/{id}", rulesHandler.Delete)
			})

			// Guard check endpoint
			r.Post("/check", checkHandler.Check)

			// Guard events
			r.Get("/events", eventsHandler.ListEvents)

			// Guard analytics
			r.Get("/analytics", eventsHandler.Analytics)
		})

		// --- Build cost module dependencies ---
		costPgStore := coststore.NewPostgresStore(s.db)
		trackerSvc := costservice.NewTrackerService(costPgStore, s.logger)
		costAnalyticsSvc := costservice.NewAnalyticsService(costPgStore, s.logger)

		costEventsHandler := costhandler.NewEventsHandler(trackerSvc, s.logger)
		costAnalyticsHandler := costhandler.NewAnalyticsHandler(costAnalyticsSvc, s.logger)
		costBudgetsHandler := costhandler.NewBudgetsHandler(costPgStore, s.logger)
		costModelsHandler := costhandler.NewModelsHandler(costPgStore, s.logger)

		// Cost module routes
		r.Route("/cost", func(r chi.Router) {
			// Cost events
			r.Post("/events", costEventsHandler.Record)
			r.Get("/events", costEventsHandler.List)

			// Cost analytics
			r.Route("/analytics", func(r chi.Router) {
				r.Get("/summary", costAnalyticsHandler.Summary)
				r.Get("/by-model", costAnalyticsHandler.ByModel)
				r.Get("/by-agent", costAnalyticsHandler.ByAgent)
				r.Get("/top-spenders", costAnalyticsHandler.TopSpenders)
				r.Get("/compare", costAnalyticsHandler.Compare)
			})

			// Budget policies CRUD
			r.Route("/budgets", func(r chi.Router) {
				r.Get("/", costBudgetsHandler.List)
				r.Post("/", costBudgetsHandler.Create)
				r.Get("/{id}", costBudgetsHandler.Get)
				r.Put("/{id}", costBudgetsHandler.Update)
				r.Delete("/{id}", costBudgetsHandler.Delete)
			})

			// Model pricing
			r.Get("/models", costModelsHandler.List)
			r.Put("/models", costModelsHandler.Upsert)
		})

		// --- Build prompt module dependencies ---
		promptPgStore := promptstore.NewPostgresStore(s.db)
		promptSvc := promptservice.NewPromptService(promptPgStore, s.logger)
		versionSvc := promptservice.NewVersionService(promptPgStore, s.logger)

		promptsHandler := prompthandler.NewPromptsHandler(promptSvc, s.logger)
		versionsHandler := prompthandler.NewVersionsHandler(versionSvc, s.logger)

		// --- Build route module dependencies ---
		routePgStore := routestore.New(s.db)
		encSvc, _ := routeservice.NewEncryption(s.cfg.EncryptionKey)

		// Build playground executor (depends on route module)
		playgroundExecutor := promptservice.NewExecutor(routePgStore, encSvc, s.logger)
		playgroundHandler := prompthandler.NewPlaygroundHandler(playgroundExecutor, promptSvc, s.logger)

		providerHandler := routehandler.NewProviderHandler(routePgStore, encSvc, s.logger)
		routeRulesHandler := routehandler.NewRouteHandler(routePgStore, s.logger)
		fallbackHandler := routehandler.NewFallbackHandler(routePgStore, s.logger)
		cacheHandler := routehandler.NewCacheHandler(routePgStore, s.logger)
		gatewayAnalyticsHandler := routehandler.NewAnalyticsHandler(routePgStore, s.logger)

		// Route module management
		r.Route("/gateway", func(r chi.Router) {
			// Providers CRUD
			r.Route("/providers", func(r chi.Router) {
				r.Get("/", providerHandler.List)
				r.Post("/", providerHandler.Create)
				r.Get("/{id}", providerHandler.Get)
				r.Put("/{id}", providerHandler.Update)
				r.Delete("/{id}", providerHandler.Delete)
			})

			// Routing rules CRUD
			r.Route("/routes", func(r chi.Router) {
				r.Get("/", routeRulesHandler.List)
				r.Post("/", routeRulesHandler.Create)
				r.Put("/{id}", routeRulesHandler.Update)
				r.Delete("/{id}", routeRulesHandler.Delete)
			})

			// Fallback chains CRUD
			r.Route("/fallbacks", func(r chi.Router) {
				r.Get("/", fallbackHandler.List)
				r.Post("/", fallbackHandler.Create)
				r.Get("/{id}", fallbackHandler.Get)
				r.Put("/{id}", fallbackHandler.Update)
				r.Delete("/{id}", fallbackHandler.Delete)
			})

			// Cache management
			r.Get("/cache/stats", cacheHandler.Stats)
			r.Post("/cache/purge", cacheHandler.Purge)

			// Gateway analytics
			r.Get("/analytics", gatewayAnalyticsHandler.GetAnalytics)
		})

		// --- Prompt Management routes ---
		r.Route("/prompts", func(r chi.Router) {
			r.Post("/", promptsHandler.Create)
			r.Get("/", promptsHandler.List)
			r.Get("/slug/{slug}", promptsHandler.GetBySlug)
			r.Get("/{id}", promptsHandler.Get)
			r.Patch("/{id}", promptsHandler.Update)
			r.Delete("/{id}", promptsHandler.Delete)

			// Version management
			r.Post("/{id}/versions", versionsHandler.Create)
			r.Get("/{id}/versions", versionsHandler.List)
			r.Get("/{id}/versions/{version}", versionsHandler.Get)
			r.Post("/{id}/deploy/{version}", versionsHandler.Deploy)
			r.Post("/{id}/rollback", versionsHandler.Rollback)
		})

		// --- Playground routes ---
		r.Route("/playground", func(r chi.Router) {
			r.Post("/execute", playgroundHandler.Execute)
			r.Post("/compare", playgroundHandler.Compare)
		})

		// --- Build dataset module dependencies ---
		datasetPgStore := datasetstore.NewPostgresStore(s.db)
		datasetSvc := datasetservice.NewDatasetService(datasetPgStore, s.logger)
		importerSvc := datasetservice.NewImporter(datasetPgStore, s.logger)
		exporterSvc := datasetservice.NewExporter(datasetPgStore, s.logger)

		dsHandler := datasethandler.NewDatasetHandler(datasetSvc, s.logger)
		dsItemHandler := datasethandler.NewItemHandler(datasetSvc, importerSvc, exporterSvc, s.logger)

		// Dataset module routes
		r.Route("/datasets", func(r chi.Router) {
			r.Post("/", dsHandler.Create)
			r.Get("/", dsHandler.List)
			r.Get("/{id}", dsHandler.Get)
			r.Patch("/{id}", dsHandler.Update)
			r.Delete("/{id}", dsHandler.Delete)
			r.Post("/{id}/link/{suiteID}", dsHandler.LinkSuite)
			r.Delete("/{id}/link/{suiteID}", dsHandler.UnlinkSuite)
			r.Post("/{id}/items", dsItemHandler.Create)
			r.Post("/{id}/items/batch", dsItemHandler.CreateBatch)
			r.Get("/{id}/items", dsItemHandler.List)
			r.Get("/{id}/items/{itemID}", dsItemHandler.Get)
			r.Delete("/{id}/items/{itemID}", dsItemHandler.Delete)
			r.Post("/{id}/import", dsItemHandler.Import)
			r.Get("/{id}/export", dsItemHandler.Export)
			r.Post("/from-session/{sessionID}", dsHandler.FromSession)
		})

		// --- Build OTel module dependencies ---
		otelTranslator := otelservice.NewTranslator(s.logger)
		otlpHandler := otelhandler.NewOTLPHandler(otelTranslator, ingestSvc, s.logger)

		// OTel OTLP receiver route
		r.Route("/otlp", func(r chi.Router) {
			r.Post("/v1/traces", otlpHandler.ReceiveTraces)
		})

		// --- Build webhook module dependencies ---
		webhookPgStore := webhookstore.NewPostgresStore(s.db)
		webhookDispatcher := webhookservice.NewDispatcher(webhookPgStore, s.nats, s.logger)

		whHandler := webhookhandler.NewWebhookHandler(webhookPgStore, webhookDispatcher, s.logger)
		whDeliveryHandler := webhookhandler.NewDeliveryHandler(webhookPgStore, webhookDispatcher, s.logger)

		// Webhook module routes
		r.Route("/webhooks", func(r chi.Router) {
			r.Post("/", whHandler.Create)
			r.Get("/", whHandler.List)
			r.Get("/{id}", whHandler.Get)
			r.Patch("/{id}", whHandler.Update)
			r.Delete("/{id}", whHandler.Delete)
			r.Post("/{id}/test", whHandler.Test)
			r.Get("/{id}/deliveries", whDeliveryHandler.List)
			r.Post("/{id}/deliveries/{deliveryID}/retry", whDeliveryHandler.Retry)
		})
	})

	// Dashboard API — authenticated via JWT
	s.router.Route("/api", func(r chi.Router) {
		r.Use(middleware.JWTAuth(s.jwtManager))

		// Organization management
		r.Route("/org", func(r chi.Router) {
			r.Get("/", s.handleGetOrg)
			r.Patch("/", s.handleUpdateOrg)
			r.Delete("/", s.handleDeleteOrg)
			r.Get("/usage", s.handleGetOrgUsage)
		})

		// API key management
		r.Route("/api-keys", func(r chi.Router) {
			r.Get("/", s.handleListAPIKeys)
			r.Post("/", s.handleCreateAPIKey)
			r.Delete("/{id}", s.handleDeleteAPIKey)
		})

		// Team management
		r.Route("/team", func(r chi.Router) {
			r.Get("/", s.handleListTeam)
			r.Post("/invite", s.handleInviteTeamMember)
			r.Patch("/{id}/role", s.handleUpdateTeamMemberRole)
			r.Delete("/{id}", s.handleRemoveTeamMember)
		})
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "healthy",
		"version": "0.1.0",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	checks := map[string]string{}

	if err := s.db.PingContext(r.Context()); err != nil {
		checks["postgres"] = "unhealthy: " + err.Error()
	} else {
		checks["postgres"] = "healthy"
	}

	if s.redis != nil {
		if err := s.redis.Ping(r.Context()).Err(); err != nil {
			checks["redis"] = "unhealthy: " + err.Error()
		} else {
			checks["redis"] = "healthy"
		}
	}

	if s.nats != nil && s.nats.IsConnected() {
		checks["nats"] = "healthy"
	} else {
		checks["nats"] = "unhealthy"
	}

	status := http.StatusOK
	overall := "ready"
	for _, v := range checks {
		if v != "healthy" {
			status = http.StatusServiceUnavailable
			overall = "not ready"
			break
		}
	}

	WriteJSON(w, status, map[string]interface{}{
		"status": overall,
		"checks": checks,
	})
}

func (s *Server) handleGitHubLogin(w http.ResponseWriter, r *http.Request) {
	if s.cfg.GitHubClientID == "" {
		WriteError(w, http.StatusNotImplemented, "OAUTH_NOT_CONFIGURED", "GitHub OAuth is not configured")
		return
	}

	oauth := &auth.GitHubOAuth{
		ClientID:     s.cfg.GitHubClientID,
		ClientSecret: s.cfg.GitHubClientSecret,
		RedirectURL:  s.cfg.FrontendURL + "/callback",
	}

	state := "random-state" // TODO: generate and store CSRF token
	WriteJSON(w, http.StatusOK, map[string]string{
		"url": oauth.AuthorizeURL(state),
	})
}

func (s *Server) handleGitHubCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_CODE", "authorization code is required")
		return
	}

	oauth := &auth.GitHubOAuth{
		ClientID:     s.cfg.GitHubClientID,
		ClientSecret: s.cfg.GitHubClientSecret,
		RedirectURL:  s.cfg.FrontendURL + "/callback",
	}

	accessToken, err := oauth.ExchangeCode(r.Context(), code)
	if err != nil {
		slog.Error("github oauth: failed to exchange code", "error", err)
		WriteError(w, http.StatusBadRequest, "OAUTH_ERROR", "failed to exchange authorization code")
		return
	}

	ghUser, err := oauth.GetUser(r.Context(), accessToken)
	if err != nil {
		slog.Error("github oauth: failed to fetch user", "error", err)
		WriteError(w, http.StatusInternalServerError, "GITHUB_ERROR", "failed to fetch user profile")
		return
	}
	slog.Info("github oauth: got user", "login", ghUser.Login, "email", ghUser.Email, "id", ghUser.ID)

	// Upsert user and org
	var userID, orgID string

	// Check if user already exists
	err = s.db.QueryRowContext(r.Context(),
		`SELECT id, org_id FROM users WHERE github_id = $1`, ghUser.ID,
	).Scan(&userID, &orgID)

	if err != nil {
		// New user — create an org for them, then insert user
		tx, txErr := s.db.BeginTx(r.Context(), nil)
		if txErr != nil {
			slog.Error("github oauth: tx begin failed", "error", txErr)
			WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to start transaction")
			return
		}
		defer tx.Rollback()

		orgName := ghUser.Login + "'s Org"
		if orgName == "'s Org" {
			orgName = "Personal"
		}
		err = tx.QueryRowContext(r.Context(),
			`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
			orgName, ghUser.Login,
		).Scan(&orgID)
		if err != nil {
			// Slug conflict — try with suffix
			err = tx.QueryRowContext(r.Context(),
				`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
				orgName, fmt.Sprintf("%s-%d", ghUser.Login, ghUser.ID),
			).Scan(&orgID)
			if err != nil {
				slog.Error("github oauth: failed to create org", "error", err)
				WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to create organization")
				return
			}
		}

		err = tx.QueryRowContext(r.Context(),
			`INSERT INTO users (email, name, avatar_url, github_id, org_id, role)
			 VALUES ($1, $2, $3, $4, $5, 'owner')
			 RETURNING id`,
			ghUser.Email, ghUser.Name, ghUser.AvatarURL, ghUser.ID, orgID,
		).Scan(&userID)
		if err != nil {
			slog.Error("github oauth: failed to create user", "error", err)
			WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to create user")
			return
		}

		// Create a default API key for the new org
		apiKey, _ := auth.GenerateAPIKey()
		keyHash := auth.HashAPIKey(apiKey)
		keyPrefix := auth.KeyPrefix(apiKey)
		_, _ = tx.ExecContext(r.Context(),
			`INSERT INTO api_keys (org_id, name, key_hash, key_prefix, created_by)
			 VALUES ($1, 'Default Key', $2, $3, $4)`,
			orgID, keyHash, keyPrefix, userID,
		)

		if txErr = tx.Commit(); txErr != nil {
			WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to commit transaction")
			return
		}
	} else {
		// Existing user — update profile
		_, _ = s.db.ExecContext(r.Context(),
			`UPDATE users SET name = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3`,
			ghUser.Name, ghUser.AvatarURL, userID,
		)
	}

	// Generate JWT
	token, err := s.jwtManager.GenerateToken(userID, orgID, ghUser.Email, "owner")
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "TOKEN_ERROR", "failed to generate token")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":         userID,
			"email":      ghUser.Email,
			"name":       ghUser.Name,
			"avatar_url": ghUser.AvatarURL,
		},
	})
}

// Ensure packages are used
var _ = auth.HashAPIKey
