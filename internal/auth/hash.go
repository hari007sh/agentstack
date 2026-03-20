package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// GenerateAPIKey creates a new API key with the "as_sk_" prefix.
func GenerateAPIKey() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate API key: %w", err)
	}
	return "as_sk_" + hex.EncodeToString(bytes), nil
}

// HashAPIKey creates a SHA-256 hash of an API key for storage.
func HashAPIKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}

// KeyPrefix returns the first 8 characters after the prefix for identification.
func KeyPrefix(key string) string {
	if len(key) > 14 {
		return key[:14] // "as_sk_" + 8 chars
	}
	return key
}
