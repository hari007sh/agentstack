package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/agentstack/agentstack/internal/auth"
)

type contextKey string

const (
	// OrgIDKey is the context key for the authenticated organization ID.
	OrgIDKey contextKey = "org_id"
	// UserIDKey is the context key for the authenticated user ID.
	UserIDKey contextKey = "user_id"
	// APIKeyIDKey is the context key for the API key ID.
	APIKeyIDKey contextKey = "api_key_id"
)

// APIKeyAuth returns middleware that authenticates requests using API keys.
func APIKeyAuth(store *auth.APIKeyStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing or invalid Authorization header")
				return
			}

			info, err := store.Validate(r.Context(), token)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "INVALID_API_KEY", "invalid or expired API key")
				return
			}

			ctx := context.WithValue(r.Context(), OrgIDKey, info.OrgID)
			ctx = context.WithValue(ctx, APIKeyIDKey, info.KeyID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// JWTAuth returns middleware that authenticates requests using JWT tokens.
func JWTAuth(jwtManager *auth.JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing or invalid Authorization header")
				return
			}

			claims, err := jwtManager.ValidateToken(token)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "INVALID_TOKEN", "invalid or expired token")
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			ctx = context.WithValue(ctx, OrgIDKey, claims.OrgID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetOrgID extracts the organization ID from the request context.
func GetOrgID(ctx context.Context) string {
	if v, ok := ctx.Value(OrgIDKey).(string); ok {
		return v
	}
	return ""
}

// GetUserID extracts the user ID from the request context.
func GetUserID(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}

func extractBearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write([]byte(`{"error":{"code":"` + code + `","message":"` + message + `"}}`))
}
