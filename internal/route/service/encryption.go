// Package service provides business logic for the Route module.
package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
)

// Encryption provides AES-256-GCM encryption and decryption for API keys.
type Encryption struct {
	key []byte
}

// NewEncryption creates a new Encryption service from a hex-encoded 32-byte key.
// If the key is empty, a random key is generated (development only).
func NewEncryption(hexKey string) (*Encryption, error) {
	if hexKey == "" {
		// Generate a random key for development.
		key := make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, key); err != nil {
			return nil, fmt.Errorf("generate random key: %w", err)
		}
		return &Encryption{key: key}, nil
	}

	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("decode encryption key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("encryption key must be 32 bytes, got %d", len(key))
	}
	return &Encryption{key: key}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM and returns the ciphertext and nonce as hex strings.
func (e *Encryption) Encrypt(plaintext string) (ciphertext, nonce string, err error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", "", fmt.Errorf("create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", fmt.Errorf("create GCM: %w", err)
	}

	nonceBytes := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonceBytes); err != nil {
		return "", "", fmt.Errorf("generate nonce: %w", err)
	}

	sealed := aesGCM.Seal(nil, nonceBytes, []byte(plaintext), nil)
	return hex.EncodeToString(sealed), hex.EncodeToString(nonceBytes), nil
}

// Decrypt decrypts AES-256-GCM ciphertext using the given nonce. Both inputs are hex-encoded.
func (e *Encryption) Decrypt(ciphertextHex, nonceHex string) (string, error) {
	ciphertextBytes, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	nonceBytes, err := hex.DecodeString(nonceHex)
	if err != nil {
		return "", fmt.Errorf("decode nonce: %w", err)
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	plaintext, err := aesGCM.Open(nil, nonceBytes, ciphertextBytes, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}

	return string(plaintext), nil
}
