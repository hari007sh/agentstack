package service

import (
	"encoding/hex"
	"strings"
	"testing"
)

func generateTestKey() string {
	// 32 bytes = 64 hex chars
	return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}

func TestNewEncryption(t *testing.T) {
	t.Run("creates with valid hex key", func(t *testing.T) {
		enc, err := NewEncryption(generateTestKey())
		if err != nil {
			t.Fatalf("NewEncryption() error: %v", err)
		}
		if enc == nil {
			t.Fatal("NewEncryption() returned nil")
		}
	})

	t.Run("creates with empty key (development mode)", func(t *testing.T) {
		enc, err := NewEncryption("")
		if err != nil {
			t.Fatalf("NewEncryption('') error: %v", err)
		}
		if enc == nil {
			t.Fatal("NewEncryption('') returned nil")
		}
		if len(enc.key) != 32 {
			t.Errorf("random key length = %d, want 32", len(enc.key))
		}
	})

	t.Run("rejects invalid hex", func(t *testing.T) {
		_, err := NewEncryption("not-a-valid-hex-string")
		if err == nil {
			t.Error("NewEncryption() should reject invalid hex")
		}
	})

	t.Run("rejects wrong key length (16 bytes)", func(t *testing.T) {
		shortKey := hex.EncodeToString(make([]byte, 16))
		_, err := NewEncryption(shortKey)
		if err == nil {
			t.Error("NewEncryption() should reject 16-byte key")
		}
	})

	t.Run("rejects wrong key length (48 bytes)", func(t *testing.T) {
		longKey := hex.EncodeToString(make([]byte, 48))
		_, err := NewEncryption(longKey)
		if err == nil {
			t.Error("NewEncryption() should reject 48-byte key")
		}
	})
}

func TestEncryptDecrypt(t *testing.T) {
	enc, err := NewEncryption(generateTestKey())
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	t.Run("round-trip basic text", func(t *testing.T) {
		plaintext := "sk-proj-abc123def456"
		ciphertext, nonce, err := enc.Encrypt(plaintext)
		if err != nil {
			t.Fatalf("Encrypt() error: %v", err)
		}

		if ciphertext == "" {
			t.Fatal("Encrypt() returned empty ciphertext")
		}
		if nonce == "" {
			t.Fatal("Encrypt() returned empty nonce")
		}

		decrypted, err := enc.Decrypt(ciphertext, nonce)
		if err != nil {
			t.Fatalf("Decrypt() error: %v", err)
		}

		if decrypted != plaintext {
			t.Errorf("Decrypt() = %q, want %q", decrypted, plaintext)
		}
	})

	t.Run("round-trip empty string", func(t *testing.T) {
		ciphertext, nonce, err := enc.Encrypt("")
		if err != nil {
			t.Fatalf("Encrypt('') error: %v", err)
		}

		decrypted, err := enc.Decrypt(ciphertext, nonce)
		if err != nil {
			t.Fatalf("Decrypt() error: %v", err)
		}

		if decrypted != "" {
			t.Errorf("Decrypt() = %q, want empty", decrypted)
		}
	})

	t.Run("round-trip long API key", func(t *testing.T) {
		longKey := strings.Repeat("x", 500)
		ciphertext, nonce, err := enc.Encrypt(longKey)
		if err != nil {
			t.Fatalf("Encrypt() error: %v", err)
		}

		decrypted, err := enc.Decrypt(ciphertext, nonce)
		if err != nil {
			t.Fatalf("Decrypt() error: %v", err)
		}

		if decrypted != longKey {
			t.Error("Decrypt() did not return original long key")
		}
	})

	t.Run("round-trip special characters", func(t *testing.T) {
		special := "sk-proj-abc!@#$%^&*()_+{}|:<>?/\\\"'\n\t"
		ciphertext, nonce, err := enc.Encrypt(special)
		if err != nil {
			t.Fatalf("Encrypt() error: %v", err)
		}

		decrypted, err := enc.Decrypt(ciphertext, nonce)
		if err != nil {
			t.Fatalf("Decrypt() error: %v", err)
		}

		if decrypted != special {
			t.Errorf("Decrypt() = %q, want %q", decrypted, special)
		}
	})

	t.Run("round-trip unicode", func(t *testing.T) {
		unicode := "API key for user@test.com"
		ciphertext, nonce, err := enc.Encrypt(unicode)
		if err != nil {
			t.Fatalf("Encrypt() error: %v", err)
		}

		decrypted, err := enc.Decrypt(ciphertext, nonce)
		if err != nil {
			t.Fatalf("Decrypt() error: %v", err)
		}

		if decrypted != unicode {
			t.Errorf("Decrypt() = %q, want %q", decrypted, unicode)
		}
	})
}

func TestEncrypt_UniqueOutputs(t *testing.T) {
	enc, err := NewEncryption(generateTestKey())
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	// Same plaintext should produce different ciphertexts due to random nonce
	plaintext := "same-key-each-time"
	ciphertexts := make(map[string]bool)
	nonces := make(map[string]bool)

	for i := 0; i < 20; i++ {
		ct, nonce, err := enc.Encrypt(plaintext)
		if err != nil {
			t.Fatalf("Encrypt() error on iteration %d: %v", i, err)
		}

		if ciphertexts[ct] {
			t.Errorf("duplicate ciphertext on iteration %d", i)
		}
		ciphertexts[ct] = true

		if nonces[nonce] {
			t.Errorf("duplicate nonce on iteration %d", i)
		}
		nonces[nonce] = true
	}
}

func TestDecrypt_Failures(t *testing.T) {
	enc, err := NewEncryption(generateTestKey())
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	// Encrypt something first
	plaintext := "test-api-key"
	ciphertext, nonce, err := enc.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt() error: %v", err)
	}

	t.Run("wrong nonce fails", func(t *testing.T) {
		wrongNonce := strings.Repeat("00", 12) // 12 bytes for GCM nonce
		_, err := enc.Decrypt(ciphertext, wrongNonce)
		if err == nil {
			t.Error("Decrypt() should fail with wrong nonce")
		}
	})

	t.Run("tampered ciphertext fails", func(t *testing.T) {
		// Flip a byte in the ciphertext
		bytes, _ := hex.DecodeString(ciphertext)
		if len(bytes) > 0 {
			bytes[0] ^= 0xFF
			tampered := hex.EncodeToString(bytes)
			_, err := enc.Decrypt(tampered, nonce)
			if err == nil {
				t.Error("Decrypt() should fail with tampered ciphertext")
			}
		}
	})

	t.Run("invalid hex ciphertext fails", func(t *testing.T) {
		_, err := enc.Decrypt("not-hex", nonce)
		if err == nil {
			t.Error("Decrypt() should fail with invalid hex ciphertext")
		}
	})

	t.Run("invalid hex nonce fails", func(t *testing.T) {
		_, err := enc.Decrypt(ciphertext, "not-hex")
		if err == nil {
			t.Error("Decrypt() should fail with invalid hex nonce")
		}
	})

	t.Run("empty ciphertext fails", func(t *testing.T) {
		_, err := enc.Decrypt("", nonce)
		if err == nil {
			t.Error("Decrypt() should fail with empty ciphertext")
		}
	})
}

func TestEncryptDecrypt_DifferentKeys(t *testing.T) {
	key1 := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	key2 := "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"

	enc1, err := NewEncryption(key1)
	if err != nil {
		t.Fatalf("setup enc1: %v", err)
	}

	enc2, err := NewEncryption(key2)
	if err != nil {
		t.Fatalf("setup enc2: %v", err)
	}

	plaintext := "cross-key-test"
	ciphertext, nonce, err := enc1.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt() error: %v", err)
	}

	// Should not decrypt with different key
	_, err = enc2.Decrypt(ciphertext, nonce)
	if err == nil {
		t.Error("Decrypt() should fail when using different encryption key")
	}

	// Should decrypt with same key
	decrypted, err := enc1.Decrypt(ciphertext, nonce)
	if err != nil {
		t.Fatalf("Decrypt() error with correct key: %v", err)
	}
	if decrypted != plaintext {
		t.Errorf("Decrypt() = %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptDecrypt_DevRandomKey(t *testing.T) {
	// Development mode: empty key generates random
	enc, err := NewEncryption("")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	plaintext := "dev-mode-test"
	ciphertext, nonce, err := enc.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt() error: %v", err)
	}

	decrypted, err := enc.Decrypt(ciphertext, nonce)
	if err != nil {
		t.Fatalf("Decrypt() error: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("Decrypt() = %q, want %q", decrypted, plaintext)
	}
}

func TestCiphertextIsHex(t *testing.T) {
	enc, err := NewEncryption(generateTestKey())
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	ciphertext, nonce, err := enc.Encrypt("test")
	if err != nil {
		t.Fatalf("Encrypt() error: %v", err)
	}

	// Verify both outputs are valid hex
	if _, err := hex.DecodeString(ciphertext); err != nil {
		t.Errorf("ciphertext is not valid hex: %v", err)
	}
	if _, err := hex.DecodeString(nonce); err != nil {
		t.Errorf("nonce is not valid hex: %v", err)
	}
}
