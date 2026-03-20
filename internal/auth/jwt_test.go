package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestNewJWTManager(t *testing.T) {
	t.Run("creates manager with secret", func(t *testing.T) {
		m := NewJWTManager("test-secret")
		if m == nil {
			t.Fatal("NewJWTManager returned nil")
		}
		if string(m.secret) != "test-secret" {
			t.Errorf("expected secret %q, got %q", "test-secret", string(m.secret))
		}
	})
}

func TestGenerateToken(t *testing.T) {
	m := NewJWTManager("super-secret-key-for-testing")

	t.Run("generates valid token string", func(t *testing.T) {
		token, err := m.GenerateToken("user-123", "org-456", "user@example.com", "admin")
		if err != nil {
			t.Fatalf("GenerateToken() error: %v", err)
		}
		if token == "" {
			t.Fatal("GenerateToken() returned empty token")
		}
	})

	t.Run("token is parseable JWT", func(t *testing.T) {
		tokenStr, err := m.GenerateToken("user-123", "org-456", "user@example.com", "admin")
		if err != nil {
			t.Fatalf("GenerateToken() error: %v", err)
		}

		parsed, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			return []byte("super-secret-key-for-testing"), nil
		})
		if err != nil {
			t.Fatalf("failed to parse generated token: %v", err)
		}
		if !parsed.Valid {
			t.Error("parsed token is not valid")
		}
	})

	t.Run("generates unique tokens", func(t *testing.T) {
		t1, _ := m.GenerateToken("user-1", "org-1", "a@b.com", "admin")
		t2, _ := m.GenerateToken("user-2", "org-2", "c@d.com", "member")
		if t1 == t2 {
			t.Error("different inputs produced identical tokens")
		}
	})
}

func TestValidateToken(t *testing.T) {
	secret := "validate-test-secret"
	m := NewJWTManager(secret)

	t.Run("validates and returns correct claims", func(t *testing.T) {
		tokenStr, err := m.GenerateToken("user-abc", "org-xyz", "hello@world.com", "admin")
		if err != nil {
			t.Fatalf("GenerateToken() error: %v", err)
		}

		claims, err := m.ValidateToken(tokenStr)
		if err != nil {
			t.Fatalf("ValidateToken() error: %v", err)
		}

		if claims.UserID != "user-abc" {
			t.Errorf("UserID = %q, want %q", claims.UserID, "user-abc")
		}
		if claims.OrgID != "org-xyz" {
			t.Errorf("OrgID = %q, want %q", claims.OrgID, "org-xyz")
		}
		if claims.Email != "hello@world.com" {
			t.Errorf("Email = %q, want %q", claims.Email, "hello@world.com")
		}
		if claims.Role != "admin" {
			t.Errorf("Role = %q, want %q", claims.Role, "admin")
		}
		if claims.Issuer != "agentstack" {
			t.Errorf("Issuer = %q, want %q", claims.Issuer, "agentstack")
		}
	})

	t.Run("rejects token signed with wrong secret", func(t *testing.T) {
		wrongManager := NewJWTManager("wrong-secret")
		tokenStr, err := wrongManager.GenerateToken("user-1", "org-1", "a@b.com", "admin")
		if err != nil {
			t.Fatalf("GenerateToken() error: %v", err)
		}

		_, err = m.ValidateToken(tokenStr)
		if err == nil {
			t.Error("ValidateToken() should have returned error for wrong secret")
		}
	})

	t.Run("rejects malformed token", func(t *testing.T) {
		_, err := m.ValidateToken("not.a.valid.jwt")
		if err == nil {
			t.Error("ValidateToken() should have returned error for malformed token")
		}
	})

	t.Run("rejects empty token", func(t *testing.T) {
		_, err := m.ValidateToken("")
		if err == nil {
			t.Error("ValidateToken() should have returned error for empty token")
		}
	})

	t.Run("rejects expired token", func(t *testing.T) {
		// Create a token that expired in the past
		claims := &Claims{
			UserID: "expired-user",
			OrgID:  "expired-org",
			Email:  "expired@test.com",
			Role:   "admin",
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
				IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
				Issuer:    "agentstack",
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenStr, err := token.SignedString([]byte(secret))
		if err != nil {
			t.Fatalf("failed to create expired token: %v", err)
		}

		_, err = m.ValidateToken(tokenStr)
		if err == nil {
			t.Error("ValidateToken() should have returned error for expired token")
		}
	})

	t.Run("rejects token with wrong signing method", func(t *testing.T) {
		// Create token with none algorithm (unsigned)
		claims := &Claims{
			UserID: "hacker",
			OrgID:  "evil-org",
			Email:  "hacker@evil.com",
			Role:   "admin",
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
				Issuer:    "agentstack",
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
		tokenStr, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
		if err != nil {
			t.Fatalf("failed to create none-signed token: %v", err)
		}

		_, err = m.ValidateToken(tokenStr)
		if err == nil {
			t.Error("ValidateToken() should have rejected token with 'none' signing method")
		}
	})
}
