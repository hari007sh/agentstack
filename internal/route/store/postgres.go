// Package store provides PostgreSQL CRUD operations for the Route module.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Store wraps a PostgreSQL connection for route module data access.
type Store struct {
	db *sql.DB
}

// New creates a new Store with the given database connection.
func New(db *sql.DB) *Store {
	return &Store{db: db}
}

// ---------- Provider CRUD ----------

// Provider represents a stored LLM provider row.
type Provider struct {
	ID              string    `json:"id"`
	OrgID           string    `json:"org_id"`
	Name            string    `json:"name"`
	DisplayName     string    `json:"display_name"`
	APIKeyEncrypted string    `json:"-"`
	APIKeyNonce     string    `json:"-"`
	BaseURL         string    `json:"base_url"`
	IsEnabled       bool      `json:"is_enabled"`
	Config          string    `json:"config"` // raw JSON
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ListProviders returns all providers for an organization.
func (s *Store) ListProviders(ctx context.Context, orgID string) ([]Provider, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, org_id, name, display_name, base_url, is_enabled, config, created_at, updated_at
		 FROM providers WHERE org_id = $1 ORDER BY name`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list providers: %w", err)
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.DisplayName, &p.BaseURL, &p.IsEnabled, &p.Config, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan provider: %w", err)
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

// GetProvider returns a single provider by ID scoped to an organization.
func (s *Store) GetProvider(ctx context.Context, orgID, id string) (*Provider, error) {
	var p Provider
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, name, display_name, base_url, is_enabled, config, created_at, updated_at
		 FROM providers WHERE id = $1 AND org_id = $2`, id, orgID,
	).Scan(&p.ID, &p.OrgID, &p.Name, &p.DisplayName, &p.BaseURL, &p.IsEnabled, &p.Config, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get provider: %w", err)
	}
	return &p, nil
}

// GetProviderWithKey returns a provider including the encrypted key fields.
func (s *Store) GetProviderWithKey(ctx context.Context, orgID, id string) (*Provider, error) {
	var p Provider
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, name, display_name, api_key_encrypted, api_key_nonce, base_url, is_enabled, config, created_at, updated_at
		 FROM providers WHERE id = $1 AND org_id = $2`, id, orgID,
	).Scan(&p.ID, &p.OrgID, &p.Name, &p.DisplayName, &p.APIKeyEncrypted, &p.APIKeyNonce, &p.BaseURL, &p.IsEnabled, &p.Config, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get provider with key: %w", err)
	}
	return &p, nil
}

// CreateProvider inserts a new provider and returns its ID.
func (s *Store) CreateProvider(ctx context.Context, p *Provider) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO providers (org_id, name, display_name, api_key_encrypted, api_key_nonce, base_url, is_enabled, config)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id`,
		p.OrgID, p.Name, p.DisplayName, p.APIKeyEncrypted, p.APIKeyNonce, p.BaseURL, p.IsEnabled, p.Config,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create provider: %w", err)
	}
	return id, nil
}

// UpdateProvider updates an existing provider's fields.
func (s *Store) UpdateProvider(ctx context.Context, p *Provider) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE providers SET name=$1, display_name=$2, api_key_encrypted=$3, api_key_nonce=$4, base_url=$5, is_enabled=$6, config=$7, updated_at=NOW()
		 WHERE id=$8 AND org_id=$9`,
		p.Name, p.DisplayName, p.APIKeyEncrypted, p.APIKeyNonce, p.BaseURL, p.IsEnabled, p.Config, p.ID, p.OrgID,
	)
	if err != nil {
		return fmt.Errorf("update provider: %w", err)
	}
	return nil
}

// DeleteProvider removes a provider by ID.
func (s *Store) DeleteProvider(ctx context.Context, orgID, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM providers WHERE id=$1 AND org_id=$2`, id, orgID)
	if err != nil {
		return fmt.Errorf("delete provider: %w", err)
	}
	return nil
}

// GetProviderByName returns a provider by its name scoped to an organization.
func (s *Store) GetProviderByName(ctx context.Context, orgID, name string) (*Provider, error) {
	var p Provider
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, name, display_name, api_key_encrypted, api_key_nonce, base_url, is_enabled, config, created_at, updated_at
		 FROM providers WHERE org_id = $1 AND name = $2`, orgID, name,
	).Scan(&p.ID, &p.OrgID, &p.Name, &p.DisplayName, &p.APIKeyEncrypted, &p.APIKeyNonce, &p.BaseURL, &p.IsEnabled, &p.Config, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get provider by name: %w", err)
	}
	return &p, nil
}

// ListEnabledProviders returns all active providers for an organization.
func (s *Store) ListEnabledProviders(ctx context.Context, orgID string) ([]Provider, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, org_id, name, display_name, api_key_encrypted, api_key_nonce, base_url, is_enabled, config, created_at, updated_at
		 FROM providers WHERE org_id = $1 AND is_enabled = true ORDER BY name`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list enabled providers: %w", err)
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.DisplayName, &p.APIKeyEncrypted, &p.APIKeyNonce, &p.BaseURL, &p.IsEnabled, &p.Config, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan provider: %w", err)
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

// ---------- Route CRUD ----------

// Route represents a routing rule row.
type Route struct {
	ID           string    `json:"id"`
	OrgID        string    `json:"org_id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	ModelPattern string    `json:"model_pattern"`
	Strategy     string    `json:"strategy"`
	ProviderID   string    `json:"provider_id"`
	TargetModel  string    `json:"target_model"`
	Priority     int       `json:"priority"`
	Weight       float64   `json:"weight"`
	Enabled      bool      `json:"enabled"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ListRoutes returns all routing rules for an organization.
func (s *Store) ListRoutes(ctx context.Context, orgID string) ([]Route, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, org_id, name, description, model_pattern, strategy, provider_id, target_model, priority, weight, enabled, created_at, updated_at
		 FROM routes WHERE org_id = $1 ORDER BY priority DESC`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list routes: %w", err)
	}
	defer rows.Close()

	var routes []Route
	for rows.Next() {
		var rt Route
		if err := rows.Scan(&rt.ID, &rt.OrgID, &rt.Name, &rt.Description, &rt.ModelPattern, &rt.Strategy, &rt.ProviderID, &rt.TargetModel, &rt.Priority, &rt.Weight, &rt.Enabled, &rt.CreatedAt, &rt.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan route: %w", err)
		}
		routes = append(routes, rt)
	}
	return routes, rows.Err()
}

// GetRoute returns a route by ID scoped to an organization.
func (s *Store) GetRoute(ctx context.Context, orgID, id string) (*Route, error) {
	var rt Route
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, name, description, model_pattern, strategy, provider_id, target_model, priority, weight, enabled, created_at, updated_at
		 FROM routes WHERE id = $1 AND org_id = $2`, id, orgID,
	).Scan(&rt.ID, &rt.OrgID, &rt.Name, &rt.Description, &rt.ModelPattern, &rt.Strategy, &rt.ProviderID, &rt.TargetModel, &rt.Priority, &rt.Weight, &rt.Enabled, &rt.CreatedAt, &rt.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get route: %w", err)
	}
	return &rt, nil
}

// CreateRoute inserts a new route and returns its ID.
func (s *Store) CreateRoute(ctx context.Context, rt *Route) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO routes (org_id, name, description, model_pattern, strategy, provider_id, target_model, priority, weight, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id`,
		rt.OrgID, rt.Name, rt.Description, rt.ModelPattern, rt.Strategy, rt.ProviderID, rt.TargetModel, rt.Priority, rt.Weight, rt.Enabled,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create route: %w", err)
	}
	return id, nil
}

// UpdateRoute updates an existing route.
func (s *Store) UpdateRoute(ctx context.Context, rt *Route) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE routes SET name=$1, description=$2, model_pattern=$3, strategy=$4, provider_id=$5, target_model=$6, priority=$7, weight=$8, enabled=$9, updated_at=NOW()
		 WHERE id=$10 AND org_id=$11`,
		rt.Name, rt.Description, rt.ModelPattern, rt.Strategy, rt.ProviderID, rt.TargetModel, rt.Priority, rt.Weight, rt.Enabled, rt.ID, rt.OrgID,
	)
	if err != nil {
		return fmt.Errorf("update route: %w", err)
	}
	return nil
}

// DeleteRoute removes a route by ID.
func (s *Store) DeleteRoute(ctx context.Context, orgID, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM routes WHERE id=$1 AND org_id=$2`, id, orgID)
	if err != nil {
		return fmt.Errorf("delete route: %w", err)
	}
	return nil
}

// ListEnabledRoutes returns all enabled routes for an organization ordered by priority.
func (s *Store) ListEnabledRoutes(ctx context.Context, orgID string) ([]Route, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, org_id, name, description, model_pattern, strategy, provider_id, target_model, priority, weight, enabled, created_at, updated_at
		 FROM routes WHERE org_id = $1 AND enabled = true ORDER BY priority DESC`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list enabled routes: %w", err)
	}
	defer rows.Close()

	var routes []Route
	for rows.Next() {
		var rt Route
		if err := rows.Scan(&rt.ID, &rt.OrgID, &rt.Name, &rt.Description, &rt.ModelPattern, &rt.Strategy, &rt.ProviderID, &rt.TargetModel, &rt.Priority, &rt.Weight, &rt.Enabled, &rt.CreatedAt, &rt.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan route: %w", err)
		}
		routes = append(routes, rt)
	}
	return routes, rows.Err()
}

// ---------- Fallback Chain CRUD ----------

// FallbackChainEntry represents one step in a fallback chain.
type FallbackChainEntry struct {
	ProviderID string `json:"provider_id"`
	Model      string `json:"model"`
	TimeoutMs  int    `json:"timeout_ms"`
}

// FallbackChain represents a fallback chain row.
type FallbackChain struct {
	ID           string               `json:"id"`
	OrgID        string               `json:"org_id"`
	Name         string               `json:"name"`
	ModelPattern string               `json:"model_pattern"`
	Chain        []FallbackChainEntry `json:"chain"`
	Enabled      bool                 `json:"enabled"`
	CreatedAt    time.Time            `json:"created_at"`
	UpdatedAt    time.Time            `json:"updated_at"`
}

// ListFallbackChains returns all fallback chains for an organization.
func (s *Store) ListFallbackChains(ctx context.Context, orgID string) ([]FallbackChain, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, org_id, name, model_pattern, chain, enabled, created_at, updated_at
		 FROM fallback_chains WHERE org_id = $1 ORDER BY name`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list fallback chains: %w", err)
	}
	defer rows.Close()

	var chains []FallbackChain
	for rows.Next() {
		var fc FallbackChain
		var chainJSON []byte
		if err := rows.Scan(&fc.ID, &fc.OrgID, &fc.Name, &fc.ModelPattern, &chainJSON, &fc.Enabled, &fc.CreatedAt, &fc.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan fallback chain: %w", err)
		}
		if err := json.Unmarshal(chainJSON, &fc.Chain); err != nil {
			fc.Chain = []FallbackChainEntry{}
		}
		chains = append(chains, fc)
	}
	return chains, rows.Err()
}

// GetFallbackChain returns a fallback chain by ID scoped to an organization.
func (s *Store) GetFallbackChain(ctx context.Context, orgID, id string) (*FallbackChain, error) {
	var fc FallbackChain
	var chainJSON []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, name, model_pattern, chain, enabled, created_at, updated_at
		 FROM fallback_chains WHERE id = $1 AND org_id = $2`, id, orgID,
	).Scan(&fc.ID, &fc.OrgID, &fc.Name, &fc.ModelPattern, &chainJSON, &fc.Enabled, &fc.CreatedAt, &fc.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get fallback chain: %w", err)
	}
	if err := json.Unmarshal(chainJSON, &fc.Chain); err != nil {
		fc.Chain = []FallbackChainEntry{}
	}
	return &fc, nil
}

// CreateFallbackChain inserts a new fallback chain and returns its ID.
func (s *Store) CreateFallbackChain(ctx context.Context, fc *FallbackChain) (string, error) {
	chainJSON, err := json.Marshal(fc.Chain)
	if err != nil {
		return "", fmt.Errorf("marshal chain: %w", err)
	}
	var id string
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO fallback_chains (org_id, name, model_pattern, chain, enabled)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		fc.OrgID, fc.Name, fc.ModelPattern, chainJSON, fc.Enabled,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create fallback chain: %w", err)
	}
	return id, nil
}

// UpdateFallbackChain updates an existing fallback chain.
func (s *Store) UpdateFallbackChain(ctx context.Context, fc *FallbackChain) error {
	chainJSON, err := json.Marshal(fc.Chain)
	if err != nil {
		return fmt.Errorf("marshal chain: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE fallback_chains SET name=$1, model_pattern=$2, chain=$3, enabled=$4, updated_at=NOW()
		 WHERE id=$5 AND org_id=$6`,
		fc.Name, fc.ModelPattern, chainJSON, fc.Enabled, fc.ID, fc.OrgID,
	)
	if err != nil {
		return fmt.Errorf("update fallback chain: %w", err)
	}
	return nil
}

// DeleteFallbackChain removes a fallback chain by ID.
func (s *Store) DeleteFallbackChain(ctx context.Context, orgID, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM fallback_chains WHERE id=$1 AND org_id=$2`, id, orgID)
	if err != nil {
		return fmt.Errorf("delete fallback chain: %w", err)
	}
	return nil
}

// ---------- Cache CRUD ----------

// CacheEntry represents a cache_entries row.
type CacheEntry struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	CacheKey    string    `json:"cache_key"`
	Model       string    `json:"model"`
	RequestHash string    `json:"request_hash"`
	Response    string    `json:"response"` // raw JSON
	TokensSaved int       `json:"tokens_saved"`
	HitCount    int       `json:"hit_count"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// CacheStats holds aggregated cache statistics for an organization.
type CacheStats struct {
	TotalEntries int   `json:"total_entries"`
	TotalHits    int64 `json:"total_hits"`
	TokensSaved  int64 `json:"tokens_saved"`
	ExpiredCount int   `json:"expired_count"`
}

// GetCacheStats returns aggregated cache statistics for an organization.
func (s *Store) GetCacheStats(ctx context.Context, orgID string) (*CacheStats, error) {
	var stats CacheStats
	err := s.db.QueryRowContext(ctx,
		`SELECT
			COUNT(*) as total_entries,
			COALESCE(SUM(hit_count), 0) as total_hits,
			COALESCE(SUM(tokens_saved * hit_count), 0) as tokens_saved,
			COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_count
		 FROM cache_entries WHERE org_id = $1`, orgID,
	).Scan(&stats.TotalEntries, &stats.TotalHits, &stats.TokensSaved, &stats.ExpiredCount)
	if err != nil {
		return nil, fmt.Errorf("get cache stats: %w", err)
	}
	return &stats, nil
}

// PurgeCache removes expired or all cache entries for an organization.
func (s *Store) PurgeCache(ctx context.Context, orgID string, expiredOnly bool) (int64, error) {
	var result sql.Result
	var err error
	if expiredOnly {
		result, err = s.db.ExecContext(ctx, `DELETE FROM cache_entries WHERE org_id = $1 AND expires_at < NOW()`, orgID)
	} else {
		result, err = s.db.ExecContext(ctx, `DELETE FROM cache_entries WHERE org_id = $1`, orgID)
	}
	if err != nil {
		return 0, fmt.Errorf("purge cache: %w", err)
	}
	return result.RowsAffected()
}

// GetCacheEntry looks up a cache entry by key and model.
func (s *Store) GetCacheEntry(ctx context.Context, orgID, cacheKey, model string) (*CacheEntry, error) {
	var ce CacheEntry
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, cache_key, model, request_hash, response, tokens_saved, hit_count, expires_at, created_at
		 FROM cache_entries WHERE org_id = $1 AND cache_key = $2 AND model = $3 AND expires_at > NOW()`,
		orgID, cacheKey, model,
	).Scan(&ce.ID, &ce.OrgID, &ce.CacheKey, &ce.Model, &ce.RequestHash, &ce.Response, &ce.TokensSaved, &ce.HitCount, &ce.ExpiresAt, &ce.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get cache entry: %w", err)
	}
	return &ce, nil
}

// UpsertCacheEntry inserts or updates a cache entry.
func (s *Store) UpsertCacheEntry(ctx context.Context, ce *CacheEntry) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO cache_entries (org_id, cache_key, model, request_hash, response, tokens_saved, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (org_id, cache_key) DO UPDATE SET
		   response = EXCLUDED.response,
		   tokens_saved = EXCLUDED.tokens_saved,
		   expires_at = EXCLUDED.expires_at`,
		ce.OrgID, ce.CacheKey, ce.Model, ce.RequestHash, ce.Response, ce.TokensSaved, ce.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("upsert cache entry: %w", err)
	}
	return nil
}

// IncrementCacheHit increments the hit counter for a cache entry.
func (s *Store) IncrementCacheHit(ctx context.Context, orgID, cacheKey, model string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE cache_entries SET hit_count = hit_count + 1 WHERE org_id = $1 AND cache_key = $2 AND model = $3`,
		orgID, cacheKey, model,
	)
	if err != nil {
		return fmt.Errorf("increment cache hit: %w", err)
	}
	return nil
}

// ---------- Gateway Request Logging ----------

// GatewayRequest represents a logged gateway request.
type GatewayRequest struct {
	ID              string    `json:"id"`
	OrgID           string    `json:"org_id"`
	ModelRequested  string    `json:"model_requested"`
	ModelUsed       string    `json:"model_used"`
	ProviderUsed    string    `json:"provider_used"`
	TokensIn        int       `json:"tokens_in"`
	TokensOut       int       `json:"tokens_out"`
	CostCents       int64     `json:"cost_cents"`
	LatencyMs       int       `json:"latency_ms"`
	TTFBMs          int       `json:"ttfb_ms"`
	CacheHit        bool      `json:"cache_hit"`
	Status          string    `json:"status"`
	ErrorMessage    *string   `json:"error_message"`
	CreatedAt       time.Time `json:"created_at"`
}

// InsertGatewayRequest logs a gateway request.
func (s *Store) InsertGatewayRequest(ctx context.Context, gr *GatewayRequest) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO gateway_requests (org_id, model_requested, model_used, provider_used, tokens_in, tokens_out, cost_cents, latency_ms, ttfb_ms, cache_hit, status, error_message)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		gr.OrgID, gr.ModelRequested, gr.ModelUsed, gr.ProviderUsed, gr.TokensIn, gr.TokensOut, gr.CostCents, gr.LatencyMs, gr.TTFBMs, gr.CacheHit, gr.Status, gr.ErrorMessage,
	)
	if err != nil {
		return fmt.Errorf("insert gateway request: %w", err)
	}
	return nil
}

// GatewayAnalytics holds aggregated gateway statistics.
type GatewayAnalytics struct {
	TotalRequests  int64   `json:"total_requests"`
	SuccessCount   int64   `json:"success_count"`
	ErrorCount     int64   `json:"error_count"`
	CacheHits      int64   `json:"cache_hits"`
	AvgLatencyMs   float64 `json:"avg_latency_ms"`
	TotalTokensIn  int64   `json:"total_tokens_in"`
	TotalTokensOut int64   `json:"total_tokens_out"`
	TotalCostCents int64   `json:"total_cost_cents"`
}

// GetGatewayAnalytics returns aggregated gateway analytics for a time range.
func (s *Store) GetGatewayAnalytics(ctx context.Context, orgID string, from, to time.Time) (*GatewayAnalytics, error) {
	var a GatewayAnalytics
	err := s.db.QueryRowContext(ctx,
		`SELECT
			COUNT(*) as total_requests,
			COUNT(*) FILTER (WHERE status = 'success') as success_count,
			COUNT(*) FILTER (WHERE status = 'error') as error_count,
			COUNT(*) FILTER (WHERE cache_hit = true) as cache_hits,
			COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
			COALESCE(SUM(tokens_in), 0) as total_tokens_in,
			COALESCE(SUM(tokens_out), 0) as total_tokens_out,
			COALESCE(SUM(cost_cents), 0) as total_cost_cents
		 FROM gateway_requests
		 WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3`,
		orgID, from, to,
	).Scan(&a.TotalRequests, &a.SuccessCount, &a.ErrorCount, &a.CacheHits, &a.AvgLatencyMs, &a.TotalTokensIn, &a.TotalTokensOut, &a.TotalCostCents)
	if err != nil {
		return nil, fmt.Errorf("get gateway analytics: %w", err)
	}
	return &a, nil
}
