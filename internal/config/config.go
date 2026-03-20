package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	Port        int
	GatewayPort int
	Environment string

	DatabaseURL  string
	ClickhouseURL string
	RedisURL     string
	NatsURL      string

	GitHubClientID     string
	GitHubClientSecret string
	JWTSecret          string

	FrontendURL string

	SendGridAPIKey string
	FromEmail      string

	EncryptionKey string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		Port:        getEnvInt("PORT", 8080),
		GatewayPort: getEnvInt("GATEWAY_PORT", 8090),
		Environment: getEnv("ENVIRONMENT", "development"),

		DatabaseURL:   getEnv("DATABASE_URL", "postgresql://agentstack:agentstack_dev@localhost:5432/agentstack?sslmode=disable"),
		ClickhouseURL: getEnv("CLICKHOUSE_URL", "clickhouse://localhost:9000/agentstack"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379"),
		NatsURL:       getEnv("NATS_URL", "nats://localhost:4222"),

		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),

		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),

		SendGridAPIKey: getEnv("SENDGRID_API_KEY", ""),
		FromEmail:      getEnv("FROM_EMAIL", "alerts@agentstack.dev"),

		EncryptionKey: getEnv("ENCRYPTION_KEY", ""),
	}

	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return cfg, nil
}

// IsDevelopment returns true if running in development mode.
func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

// Addr returns the server listen address.
func (c *Config) Addr() string {
	return fmt.Sprintf(":%d", c.Port)
}

// GatewayAddr returns the gateway listen address.
func (c *Config) GatewayAddr() string {
	return fmt.Sprintf(":%d", c.GatewayPort)
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return fallback
}
