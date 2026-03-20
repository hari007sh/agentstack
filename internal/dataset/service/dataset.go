// Package service provides business logic for the Dataset module.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/agentstack/agentstack/internal/dataset/store"
)

// DatasetService handles dataset business logic.
type DatasetService struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewDatasetService creates a new dataset service.
func NewDatasetService(pg *store.PostgresStore, logger *slog.Logger) *DatasetService {
	return &DatasetService{pg: pg, logger: logger}
}

// CreateDataset creates a new dataset with validation.
func (s *DatasetService) CreateDataset(ctx context.Context, d *store.Dataset) error {
	if d.Name == "" {
		return fmt.Errorf("name is required")
	}
	if d.Source == "" {
		d.Source = "manual"
	}
	if d.Tags == nil {
		d.Tags = []string{}
	}
	if d.Schema == nil {
		d.Schema = json.RawMessage(`{}`)
	}

	if err := s.pg.CreateDataset(ctx, d); err != nil {
		return fmt.Errorf("create dataset: %w", err)
	}
	return nil
}

// GetDataset retrieves a dataset by ID.
func (s *DatasetService) GetDataset(ctx context.Context, orgID, id string) (*store.Dataset, error) {
	return s.pg.GetDataset(ctx, orgID, id)
}

// ListDatasets returns paginated datasets for an org.
func (s *DatasetService) ListDatasets(ctx context.Context, orgID string, limit, offset int) ([]store.Dataset, int, error) {
	return s.pg.ListDatasets(ctx, orgID, limit, offset)
}

// UpdateDataset updates dataset metadata.
func (s *DatasetService) UpdateDataset(ctx context.Context, d *store.Dataset) error {
	return s.pg.UpdateDataset(ctx, d)
}

// DeleteDataset deletes a dataset and all related data.
func (s *DatasetService) DeleteDataset(ctx context.Context, orgID, id string) error {
	return s.pg.DeleteDataset(ctx, orgID, id)
}

// AddItem adds a single item and updates the count.
func (s *DatasetService) AddItem(ctx context.Context, item *store.DatasetItem) error {
	if err := s.pg.CreateItem(ctx, item); err != nil {
		return fmt.Errorf("create item: %w", err)
	}
	if err := s.pg.IncrementItemCount(ctx, item.OrgID, item.DatasetID, 1); err != nil {
		s.logger.Error("failed to increment item count", "dataset_id", item.DatasetID, "error", err)
	}
	return nil
}

// AddItemsBatch adds multiple items and updates the count.
func (s *DatasetService) AddItemsBatch(ctx context.Context, orgID, datasetID string, items []store.DatasetItem) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}
	if len(items) > 1000 {
		return 0, fmt.Errorf("batch size exceeds maximum of 1000 items")
	}

	for i := range items {
		items[i].DatasetID = datasetID
		items[i].OrgID = orgID
	}

	if err := s.pg.CreateItemsBatch(ctx, items); err != nil {
		return 0, fmt.Errorf("create items batch: %w", err)
	}

	if err := s.pg.IncrementItemCount(ctx, orgID, datasetID, len(items)); err != nil {
		s.logger.Error("failed to increment item count", "dataset_id", datasetID, "error", err)
	}

	return len(items), nil
}

// GetItem retrieves a single dataset item.
func (s *DatasetService) GetItem(ctx context.Context, orgID, datasetID, itemID string) (*store.DatasetItem, error) {
	return s.pg.GetItem(ctx, orgID, datasetID, itemID)
}

// ListItems returns paginated items.
func (s *DatasetService) ListItems(ctx context.Context, orgID, datasetID string, limit, offset int) ([]store.DatasetItem, int, error) {
	return s.pg.ListItems(ctx, orgID, datasetID, limit, offset)
}

// DeleteItem deletes a single item and updates the count.
func (s *DatasetService) DeleteItem(ctx context.Context, orgID, datasetID, itemID string) error {
	if err := s.pg.DeleteItem(ctx, orgID, datasetID, itemID); err != nil {
		if err == sql.ErrNoRows {
			return err
		}
		return fmt.Errorf("delete item: %w", err)
	}
	if err := s.pg.IncrementItemCount(ctx, orgID, datasetID, -1); err != nil {
		s.logger.Error("failed to decrement item count", "dataset_id", datasetID, "error", err)
	}
	return nil
}

// LinkSuite links a dataset to a test suite.
func (s *DatasetService) LinkSuite(ctx context.Context, orgID, datasetID, suiteID string) (*store.DatasetSuiteLink, error) {
	link := &store.DatasetSuiteLink{
		DatasetID: datasetID,
		SuiteID:   suiteID,
		OrgID:     orgID,
	}
	if err := s.pg.LinkSuite(ctx, link); err != nil {
		return nil, fmt.Errorf("link suite: %w", err)
	}
	return link, nil
}

// UnlinkSuite removes a dataset-suite link.
func (s *DatasetService) UnlinkSuite(ctx context.Context, orgID, datasetID, suiteID string) error {
	return s.pg.UnlinkSuite(ctx, orgID, datasetID, suiteID)
}

// ListLinkedSuites returns all suite links for a dataset.
func (s *DatasetService) ListLinkedSuites(ctx context.Context, orgID, datasetID string) ([]store.DatasetSuiteLink, error) {
	return s.pg.ListLinkedSuites(ctx, orgID, datasetID)
}

// ExportItems returns all items for export.
func (s *DatasetService) ExportItems(ctx context.Context, orgID, datasetID string) ([]store.DatasetItem, error) {
	return s.pg.ListAllItems(ctx, orgID, datasetID)
}
