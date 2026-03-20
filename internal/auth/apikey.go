package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// APIKeyStore handles API key lookups in the database.
type APIKeyStore struct {
	db *sql.DB
}

// NewAPIKeyStore creates a new API key store.
func NewAPIKeyStore(db *sql.DB) *APIKeyStore {
	return &APIKeyStore{db: db}
}

// APIKeyInfo contains the resolved information from an API key lookup.
type APIKeyInfo struct {
	KeyID string
	OrgID string
}

// Validate checks an API key against the database and returns the associated org.
func (s *APIKeyStore) Validate(ctx context.Context, key string) (*APIKeyInfo, error) {
	hash := HashAPIKey(key)

	var info APIKeyInfo
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id FROM api_keys
		 WHERE key_hash = $1
		 AND (expires_at IS NULL OR expires_at > $2)`,
		hash, time.Now(),
	).Scan(&info.KeyID, &info.OrgID)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("invalid API key")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to validate API key: %w", err)
	}

	// Update last used timestamp asynchronously
	go func() {
		_, _ = s.db.ExecContext(context.Background(),
			`UPDATE api_keys SET last_used_at = $1 WHERE id = $2`,
			time.Now(), info.KeyID,
		)
	}()

	return &info, nil
}
