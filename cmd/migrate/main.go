package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/agentstack/agentstack/internal/config"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	direction := flag.String("direction", "up", "migration direction: up or down")
	seed := flag.Bool("seed", false, "run seed data after migrations")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	// Run PostgreSQL migrations
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to postgres: %v", err)
	}
	defer db.Close()

	if err := runPostgresMigrations(db, *direction); err != nil {
		log.Fatalf("postgres migration failed: %v", err)
	}

	// Run ClickHouse migrations
	if err := runClickHouseMigrations(*direction); err != nil {
		log.Printf("WARNING: clickhouse migration failed (may not be running): %v", err)
	}

	if *seed {
		log.Println("Seeding data...")
		if err := runSeed(db); err != nil {
			log.Fatalf("seed failed: %v", err)
		}
		log.Println("Seed complete")
	}

	log.Println("Migrations complete")
}

func runPostgresMigrations(db *sql.DB, direction string) error {
	_, err := db.ExecContext(context.Background(), `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	migrationsDir := "migrations/postgres"
	suffix := ".up.sql"
	if direction == "down" {
		suffix = ".down.sql"
	}

	files, err := filepath.Glob(filepath.Join(migrationsDir, "*"+suffix))
	if err != nil {
		return fmt.Errorf("failed to glob migrations: %w", err)
	}
	sort.Strings(files)

	if direction == "down" {
		for i, j := 0, len(files)-1; i < j; i, j = i+1, j-1 {
			files[i], files[j] = files[j], files[i]
		}
	}

	for _, file := range files {
		version := extractVersion(filepath.Base(file))

		if direction == "up" {
			var exists bool
			err := db.QueryRowContext(context.Background(),
				"SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)",
				version,
			).Scan(&exists)
			if err != nil {
				return fmt.Errorf("failed to check migration status: %w", err)
			}
			if exists {
				log.Printf("  skip %s (already applied)", filepath.Base(file))
				continue
			}
		}

		content, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", file, err)
		}

		log.Printf("  applying %s", filepath.Base(file))
		_, err = db.ExecContext(context.Background(), string(content))
		if err != nil {
			return fmt.Errorf("failed to apply %s: %w", file, err)
		}

		if direction == "up" {
			_, err = db.ExecContext(context.Background(),
				"INSERT INTO schema_migrations (version) VALUES ($1)", version)
		} else {
			_, err = db.ExecContext(context.Background(),
				"DELETE FROM schema_migrations WHERE version = $1", version)
		}
		if err != nil {
			return fmt.Errorf("failed to update migration tracking: %w", err)
		}
	}

	return nil
}

func runClickHouseMigrations(direction string) error {
	log.Println("Running ClickHouse migrations via HTTP interface...")

	migrationsDir := "migrations/clickhouse"
	suffix := ".up.sql"
	if direction == "down" {
		suffix = ".down.sql"
	}

	files, err := filepath.Glob(filepath.Join(migrationsDir, "*"+suffix))
	if err != nil {
		return fmt.Errorf("failed to glob clickhouse migrations: %w", err)
	}
	sort.Strings(files)

	if direction == "down" {
		for i, j := 0, len(files)-1; i < j; i, j = i+1, j-1 {
			files[i], files[j] = files[j], files[i]
		}
	}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", file, err)
		}

		log.Printf("  applying CH: %s", filepath.Base(file))

		statements := strings.Split(string(content), ";")
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if err := executeClickHouseHTTP(stmt); err != nil {
				return fmt.Errorf("failed to apply %s: %w", file, err)
			}
		}
	}

	return nil
}

func executeClickHouseHTTP(query string) error {
	resp, err := http.Post("http://localhost:8123/", "text/plain", strings.NewReader(query))
	if err != nil {
		return fmt.Errorf("clickhouse HTTP error: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func runSeed(db *sql.DB) error {
	seedDir := "seed"

	// Seed failure_patterns
	if err := seedFailurePatterns(db, seedDir); err != nil {
		return fmt.Errorf("seed failure_patterns: %w", err)
	}

	// Seed evaluators
	if err := seedEvaluators(db, seedDir); err != nil {
		return fmt.Errorf("seed evaluators: %w", err)
	}

	// Seed guardrails
	if err := seedGuardrails(db, seedDir); err != nil {
		return fmt.Errorf("seed guardrails: %w", err)
	}

	// Seed model_pricing
	if err := seedModelPricing(db, seedDir); err != nil {
		return fmt.Errorf("seed model_pricing: %w", err)
	}

	return nil
}

func seedFailurePatterns(db *sql.DB, seedDir string) error {
	data, err := os.ReadFile(fmt.Sprintf("%s/failure_patterns.json", seedDir))
	if err != nil {
		log.Printf("  skip failure_patterns.json: %v", err)
		return nil
	}

	var patterns []struct {
		Name           string          `json:"name"`
		Description    string          `json:"description"`
		Category       string          `json:"category"`
		Severity       string          `json:"severity"`
		DetectionRules json.RawMessage `json:"detection_rules"`
		IsBuiltin      bool            `json:"is_builtin"`
	}
	if err := json.Unmarshal(data, &patterns); err != nil {
		return fmt.Errorf("parse failure_patterns.json: %w", err)
	}

	query := `INSERT INTO failure_patterns (org_id, name, description, category, detection_rules, severity, is_builtin, enabled)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, true)
	          ON CONFLICT DO NOTHING`

	count := 0
	for _, p := range patterns {
		rulesJSON := p.DetectionRules
		if rulesJSON == nil {
			rulesJSON = json.RawMessage("{}")
		}
		result, err := db.ExecContext(context.Background(), query,
			"00000000-0000-0000-0000-000000000001", // builtin org
			p.Name, p.Description, p.Category, rulesJSON, p.Severity, p.IsBuiltin,
		)
		if err != nil {
			log.Printf("  warning: failed to insert pattern %q: %v", p.Name, err)
			continue
		}
		n, _ := result.RowsAffected()
		count += int(n)
	}
	log.Printf("  seeded %d failure patterns (of %d)", count, len(patterns))
	return nil
}

func seedEvaluators(db *sql.DB, seedDir string) error {
	data, err := os.ReadFile(fmt.Sprintf("%s/evaluators.json", seedDir))
	if err != nil {
		log.Printf("  skip evaluators.json: %v", err)
		return nil
	}

	var evaluators []struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Type        string          `json:"type"`
		Subtype     string          `json:"subtype"`
		Config      json.RawMessage `json:"config"`
		IsBuiltin   bool            `json:"is_builtin"`
	}
	if err := json.Unmarshal(data, &evaluators); err != nil {
		return fmt.Errorf("parse evaluators.json: %w", err)
	}

	query := `INSERT INTO evaluators (org_id, name, description, type, subtype, config, is_builtin)
	          VALUES ($1, $2, $3, $4, $5, $6, $7)
	          ON CONFLICT DO NOTHING`

	count := 0
	for _, e := range evaluators {
		cfgJSON := e.Config
		if cfgJSON == nil {
			cfgJSON = json.RawMessage("{}")
		}
		result, err := db.ExecContext(context.Background(), query,
			"00000000-0000-0000-0000-000000000001", // builtin org
			e.Name, e.Description, e.Type, e.Subtype, cfgJSON, e.IsBuiltin,
		)
		if err != nil {
			log.Printf("  warning: failed to insert evaluator %q: %v", e.Name, err)
			continue
		}
		n, _ := result.RowsAffected()
		count += int(n)
	}
	log.Printf("  seeded %d evaluators (of %d)", count, len(evaluators))
	return nil
}

func seedGuardrails(db *sql.DB, seedDir string) error {
	data, err := os.ReadFile(fmt.Sprintf("%s/guardrails.json", seedDir))
	if err != nil {
		log.Printf("  skip guardrails.json: %v", err)
		return nil
	}

	var guardrails []struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Type        string          `json:"type"`
		Mode        string          `json:"mode"`
		ApplyTo     string          `json:"apply_to"`
		Config      json.RawMessage `json:"config"`
		IsBuiltin   bool            `json:"is_builtin"`
		Priority    int             `json:"priority"`
	}
	if err := json.Unmarshal(data, &guardrails); err != nil {
		return fmt.Errorf("parse guardrails.json: %w", err)
	}

	query := `INSERT INTO guardrails (org_id, name, description, type, mode, apply_to, config, is_builtin, priority, enabled)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
	          ON CONFLICT DO NOTHING`

	count := 0
	for _, g := range guardrails {
		cfgJSON := g.Config
		if cfgJSON == nil {
			cfgJSON = json.RawMessage("{}")
		}
		result, err := db.ExecContext(context.Background(), query,
			"00000000-0000-0000-0000-000000000001", // builtin org
			g.Name, g.Description, g.Type, g.Mode, g.ApplyTo, cfgJSON, g.IsBuiltin, g.Priority,
		)
		if err != nil {
			log.Printf("  warning: failed to insert guardrail %q: %v", g.Name, err)
			continue
		}
		n, _ := result.RowsAffected()
		count += int(n)
	}
	log.Printf("  seeded %d guardrails (of %d)", count, len(guardrails))
	return nil
}

func seedModelPricing(db *sql.DB, seedDir string) error {
	data, err := os.ReadFile(fmt.Sprintf("%s/model_pricing.json", seedDir))
	if err != nil {
		log.Printf("  skip model_pricing.json: %v", err)
		return nil
	}

	var pricing []struct {
		Provider        string `json:"provider"`
		Model           string `json:"model"`
		InputCostPer1M  int    `json:"input_cost_per_1m"`
		OutputCostPer1M int    `json:"output_cost_per_1m"`
	}
	if err := json.Unmarshal(data, &pricing); err != nil {
		return fmt.Errorf("parse model_pricing.json: %w", err)
	}

	query := `INSERT INTO model_pricing (provider, model, input_cost_per_1m, output_cost_per_1m)
	          VALUES ($1, $2, $3, $4)
	          ON CONFLICT (provider, model) DO NOTHING`

	count := 0
	for _, p := range pricing {
		result, err := db.ExecContext(context.Background(), query,
			p.Provider, p.Model, p.InputCostPer1M, p.OutputCostPer1M,
		)
		if err != nil {
			log.Printf("  warning: failed to insert model pricing %s/%s: %v", p.Provider, p.Model, err)
			continue
		}
		n, _ := result.RowsAffected()
		count += int(n)
	}
	log.Printf("  seeded %d model pricing entries (of %d)", count, len(pricing))
	return nil
}

func extractVersion(filename string) string {
	parts := strings.SplitN(filename, "_", 2)
	if len(parts) > 0 {
		return parts[0]
	}
	return filename
}
