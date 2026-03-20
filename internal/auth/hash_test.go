package auth

import (
	"strings"
	"testing"
)

func TestGenerateAPIKey(t *testing.T) {
	t.Run("returns key with correct prefix", func(t *testing.T) {
		key, err := GenerateAPIKey()
		if err != nil {
			t.Fatalf("GenerateAPIKey() returned error: %v", err)
		}
		if !strings.HasPrefix(key, "as_sk_") {
			t.Errorf("expected key to start with 'as_sk_', got %q", key)
		}
	})

	t.Run("returns key with correct length", func(t *testing.T) {
		key, err := GenerateAPIKey()
		if err != nil {
			t.Fatalf("GenerateAPIKey() returned error: %v", err)
		}
		// "as_sk_" (6 chars) + 64 hex chars (32 bytes) = 70
		if len(key) != 70 {
			t.Errorf("expected key length 70, got %d: %q", len(key), key)
		}
	})

	t.Run("generates unique keys", func(t *testing.T) {
		keys := make(map[string]bool)
		for i := 0; i < 100; i++ {
			key, err := GenerateAPIKey()
			if err != nil {
				t.Fatalf("GenerateAPIKey() returned error on iteration %d: %v", i, err)
			}
			if keys[key] {
				t.Fatalf("duplicate key generated on iteration %d: %q", i, key)
			}
			keys[key] = true
		}
	})

	t.Run("key contains only valid hex characters after prefix", func(t *testing.T) {
		key, err := GenerateAPIKey()
		if err != nil {
			t.Fatalf("GenerateAPIKey() returned error: %v", err)
		}
		hexPart := key[6:] // Strip "as_sk_"
		for _, c := range hexPart {
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
				t.Errorf("invalid hex character %q in key hex part %q", string(c), hexPart)
			}
		}
	})
}

func TestHashAPIKey(t *testing.T) {
	t.Run("produces consistent hash", func(t *testing.T) {
		key := "as_sk_test1234567890abcdef"
		hash1 := HashAPIKey(key)
		hash2 := HashAPIKey(key)
		if hash1 != hash2 {
			t.Errorf("same key produced different hashes: %q vs %q", hash1, hash2)
		}
	})

	t.Run("produces 64 character hex hash", func(t *testing.T) {
		hash := HashAPIKey("as_sk_somekey")
		if len(hash) != 64 {
			t.Errorf("expected hash length 64, got %d: %q", len(hash), hash)
		}
	})

	t.Run("different keys produce different hashes", func(t *testing.T) {
		hash1 := HashAPIKey("as_sk_key_one")
		hash2 := HashAPIKey("as_sk_key_two")
		if hash1 == hash2 {
			t.Error("different keys produced the same hash")
		}
	})

	t.Run("empty string produces valid hash", func(t *testing.T) {
		hash := HashAPIKey("")
		if len(hash) != 64 {
			t.Errorf("expected hash length 64 for empty string, got %d", len(hash))
		}
	})
}

func TestKeyPrefix(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		expected string
	}{
		{
			name:     "full key returns first 14 chars",
			key:      "as_sk_abcdef1234567890",
			expected: "as_sk_abcdef12",
		},
		{
			name:     "short key returns entire key",
			key:      "as_sk_abc",
			expected: "as_sk_abc",
		},
		{
			name:     "exactly 14 chars returns full key",
			key:      "as_sk_abcdef12",
			expected: "as_sk_abcdef12",
		},
		{
			name:     "empty key returns empty",
			key:      "",
			expected: "",
		},
		{
			name:     "key shorter than prefix returns as is",
			key:      "as_sk",
			expected: "as_sk",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := KeyPrefix(tc.key)
			if result != tc.expected {
				t.Errorf("KeyPrefix(%q) = %q, want %q", tc.key, result, tc.expected)
			}
		})
	}
}
