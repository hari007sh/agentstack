// Package store provides PostgreSQL CRUD operations for the Dataset module.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PostgresStore provides CRUD access to dataset data in PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgreSQL store for the Dataset module.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// DB returns the underlying database connection.
func (s *PostgresStore) DB() *sql.DB {
	return s.db
}

// ========================
// Domain Structs
// ========================

// Dataset represents a collection of evaluation data items.
type Dataset struct {
	ID          string          `json:"id"`
	OrgID       string          `json:"org_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
	ItemCount   int             `json:"item_count"`
	Tags        []string        `json:"tags"`
	Source      string          `json:"source"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// DatasetItem represents a single row in a dataset.
type DatasetItem struct {
	ID        string          `json:"id"`
	DatasetID string          `json:"dataset_id"`
	OrgID     string          `json:"org_id"`
	Data      json.RawMessage `json:"data"`
	Metadata  json.RawMessage `json:"metadata"`
	CreatedAt time.Time       `json:"created_at"`
}

// DatasetSuiteLink represents a link between a dataset and a test suite.
type DatasetSuiteLink struct {
	ID        string    `json:"id"`
	DatasetID string    `json:"dataset_id"`
	SuiteID   string    `json:"suite_id"`
	OrgID     string    `json:"org_id"`
	CreatedAt time.Time `json:"created_at"`
}

// ========================
// Dataset CRUD
// ========================

// CreateDataset inserts a new dataset.
func (s *PostgresStore) CreateDataset(ctx context.Context, d *Dataset) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	if d.Schema == nil {
		d.Schema = json.RawMessage(`{}`)
	}
	if d.Source == "" {
		d.Source = "manual"
	}

	query := `INSERT INTO datasets (id, org_id, name, description, schema, item_count, tags, source)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	          RETURNING created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		d.ID, d.OrgID, d.Name, d.Description, d.Schema, d.ItemCount, d.Tags, d.Source,
	).Scan(&d.CreatedAt, &d.UpdatedAt)
}

// GetDataset returns a single dataset by ID.
func (s *PostgresStore) GetDataset(ctx context.Context, orgID, id string) (*Dataset, error) {
	query := `SELECT id, org_id, name, description, schema, item_count, tags, source, created_at, updated_at
	          FROM datasets WHERE org_id = $1 AND id = $2`

	var d Dataset
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&d.ID, &d.OrgID, &d.Name, &d.Description, &d.Schema,
		&d.ItemCount, &d.Tags, &d.Source, &d.CreatedAt, &d.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get dataset: %w", err)
	}
	if d.Tags == nil {
		d.Tags = []string{}
	}
	return &d, nil
}

// ListDatasets returns all datasets for an organization.
func (s *PostgresStore) ListDatasets(ctx context.Context, orgID string, limit, offset int) ([]Dataset, int, error) {
	if limit <= 0 {
		limit = 50
	}

	countQuery := `SELECT COUNT(*) FROM datasets WHERE org_id = $1`
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, orgID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count datasets: %w", err)
	}

	query := `SELECT id, org_id, name, description, schema, item_count, tags, source, created_at, updated_at
	          FROM datasets WHERE org_id = $1
	          ORDER BY created_at DESC
	          LIMIT $2 OFFSET $3`

	rows, err := s.db.QueryContext(ctx, query, orgID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list datasets: %w", err)
	}
	defer rows.Close()

	var datasets []Dataset
	for rows.Next() {
		var d Dataset
		if err := rows.Scan(&d.ID, &d.OrgID, &d.Name, &d.Description, &d.Schema,
			&d.ItemCount, &d.Tags, &d.Source, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan dataset: %w", err)
		}
		if d.Tags == nil {
			d.Tags = []string{}
		}
		datasets = append(datasets, d)
	}
	if datasets == nil {
		datasets = []Dataset{}
	}
	return datasets, total, rows.Err()
}

// UpdateDataset updates dataset metadata.
func (s *PostgresStore) UpdateDataset(ctx context.Context, d *Dataset) error {
	query := `UPDATE datasets SET name = $1, description = $2, tags = $3, schema = $4, updated_at = NOW()
	          WHERE org_id = $5 AND id = $6
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		d.Name, d.Description, d.Tags, d.Schema, d.OrgID, d.ID,
	).Scan(&d.UpdatedAt)
}

// DeleteDataset deletes a dataset and cascades to items and links.
func (s *PostgresStore) DeleteDataset(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM datasets WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete dataset: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// IncrementItemCount increases the item count on a dataset.
func (s *PostgresStore) IncrementItemCount(ctx context.Context, orgID, datasetID string, delta int) error {
	query := `UPDATE datasets SET item_count = item_count + $1, updated_at = NOW()
	          WHERE org_id = $2 AND id = $3`
	_, err := s.db.ExecContext(ctx, query, delta, orgID, datasetID)
	return err
}

// ========================
// DatasetItem CRUD
// ========================

// CreateItem inserts a single item into a dataset.
func (s *PostgresStore) CreateItem(ctx context.Context, item *DatasetItem) error {
	if item.ID == "" {
		item.ID = uuid.New().String()
	}
	if item.Metadata == nil {
		item.Metadata = json.RawMessage(`{}`)
	}

	query := `INSERT INTO dataset_items (id, dataset_id, org_id, data, metadata)
	          VALUES ($1, $2, $3, $4, $5)
	          RETURNING created_at`

	return s.db.QueryRowContext(ctx, query,
		item.ID, item.DatasetID, item.OrgID, item.Data, item.Metadata,
	).Scan(&item.CreatedAt)
}

// CreateItemsBatch inserts multiple items in a single transaction.
func (s *PostgresStore) CreateItemsBatch(ctx context.Context, items []DatasetItem) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO dataset_items (id, dataset_id, org_id, data, metadata) VALUES ($1, $2, $3, $4, $5)`)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	for i := range items {
		if items[i].ID == "" {
			items[i].ID = uuid.New().String()
		}
		if items[i].Metadata == nil {
			items[i].Metadata = json.RawMessage(`{}`)
		}
		if _, err := stmt.ExecContext(ctx, items[i].ID, items[i].DatasetID, items[i].OrgID, items[i].Data, items[i].Metadata); err != nil {
			return fmt.Errorf("insert item %d: %w", i, err)
		}
	}

	return tx.Commit()
}

// GetItem returns a single dataset item.
func (s *PostgresStore) GetItem(ctx context.Context, orgID, datasetID, itemID string) (*DatasetItem, error) {
	query := `SELECT id, dataset_id, org_id, data, metadata, created_at
	          FROM dataset_items WHERE org_id = $1 AND dataset_id = $2 AND id = $3`

	var item DatasetItem
	err := s.db.QueryRowContext(ctx, query, orgID, datasetID, itemID).Scan(
		&item.ID, &item.DatasetID, &item.OrgID, &item.Data, &item.Metadata, &item.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get item: %w", err)
	}
	return &item, nil
}

// ListItems returns paginated items for a dataset.
func (s *PostgresStore) ListItems(ctx context.Context, orgID, datasetID string, limit, offset int) ([]DatasetItem, int, error) {
	if limit <= 0 {
		limit = 50
	}

	countQuery := `SELECT COUNT(*) FROM dataset_items WHERE org_id = $1 AND dataset_id = $2`
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, orgID, datasetID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count items: %w", err)
	}

	query := `SELECT id, dataset_id, org_id, data, metadata, created_at
	          FROM dataset_items WHERE org_id = $1 AND dataset_id = $2
	          ORDER BY created_at ASC
	          LIMIT $3 OFFSET $4`

	rows, err := s.db.QueryContext(ctx, query, orgID, datasetID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list items: %w", err)
	}
	defer rows.Close()

	var items []DatasetItem
	for rows.Next() {
		var item DatasetItem
		if err := rows.Scan(&item.ID, &item.DatasetID, &item.OrgID, &item.Data, &item.Metadata, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan item: %w", err)
		}
		items = append(items, item)
	}
	if items == nil {
		items = []DatasetItem{}
	}
	return items, total, rows.Err()
}

// ListAllItems returns all items for a dataset (for export).
func (s *PostgresStore) ListAllItems(ctx context.Context, orgID, datasetID string) ([]DatasetItem, error) {
	query := `SELECT id, dataset_id, org_id, data, metadata, created_at
	          FROM dataset_items WHERE org_id = $1 AND dataset_id = $2
	          ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, query, orgID, datasetID)
	if err != nil {
		return nil, fmt.Errorf("list all items: %w", err)
	}
	defer rows.Close()

	var items []DatasetItem
	for rows.Next() {
		var item DatasetItem
		if err := rows.Scan(&item.ID, &item.DatasetID, &item.OrgID, &item.Data, &item.Metadata, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		items = append(items, item)
	}
	if items == nil {
		items = []DatasetItem{}
	}
	return items, rows.Err()
}

// DeleteItem deletes a single dataset item.
func (s *PostgresStore) DeleteItem(ctx context.Context, orgID, datasetID, itemID string) error {
	query := `DELETE FROM dataset_items WHERE org_id = $1 AND dataset_id = $2 AND id = $3`
	result, err := s.db.ExecContext(ctx, query, orgID, datasetID, itemID)
	if err != nil {
		return fmt.Errorf("delete item: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ========================
// Dataset-Suite Links
// ========================

// LinkSuite links a dataset to a test suite.
func (s *PostgresStore) LinkSuite(ctx context.Context, link *DatasetSuiteLink) error {
	if link.ID == "" {
		link.ID = uuid.New().String()
	}
	query := `INSERT INTO dataset_suite_links (id, dataset_id, suite_id, org_id)
	          VALUES ($1, $2, $3, $4)
	          RETURNING created_at`

	return s.db.QueryRowContext(ctx, query,
		link.ID, link.DatasetID, link.SuiteID, link.OrgID,
	).Scan(&link.CreatedAt)
}

// UnlinkSuite removes a dataset-suite link.
func (s *PostgresStore) UnlinkSuite(ctx context.Context, orgID, datasetID, suiteID string) error {
	query := `DELETE FROM dataset_suite_links WHERE org_id = $1 AND dataset_id = $2 AND suite_id = $3`
	result, err := s.db.ExecContext(ctx, query, orgID, datasetID, suiteID)
	if err != nil {
		return fmt.Errorf("unlink suite: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ListLinkedSuites returns all suite links for a dataset.
func (s *PostgresStore) ListLinkedSuites(ctx context.Context, orgID, datasetID string) ([]DatasetSuiteLink, error) {
	query := `SELECT id, dataset_id, suite_id, org_id, created_at
	          FROM dataset_suite_links WHERE org_id = $1 AND dataset_id = $2
	          ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, datasetID)
	if err != nil {
		return nil, fmt.Errorf("list linked suites: %w", err)
	}
	defer rows.Close()

	var links []DatasetSuiteLink
	for rows.Next() {
		var link DatasetSuiteLink
		if err := rows.Scan(&link.ID, &link.DatasetID, &link.SuiteID, &link.OrgID, &link.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan link: %w", err)
		}
		links = append(links, link)
	}
	if links == nil {
		links = []DatasetSuiteLink{}
	}
	return links, rows.Err()
}
