package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/agentstack/agentstack/internal/dataset/store"
)

// Exporter handles exporting dataset items to various formats.
type Exporter struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewExporter creates a new Exporter.
func NewExporter(pg *store.PostgresStore, logger *slog.Logger) *Exporter {
	return &Exporter{pg: pg, logger: logger}
}

// ExportItem represents a single exported item.
type ExportItem struct {
	ID       string          `json:"id"`
	Data     json.RawMessage `json:"data"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

// ExportResult contains the full export.
type ExportResult struct {
	DatasetID   string       `json:"dataset_id"`
	DatasetName string       `json:"dataset_name"`
	ItemCount   int          `json:"item_count"`
	Items       []ExportItem `json:"items"`
}

// ExportJSON exports all dataset items as a JSON structure.
func (e *Exporter) ExportJSON(ctx context.Context, orgID, datasetID string) (*ExportResult, error) {
	dataset, err := e.pg.GetDataset(ctx, orgID, datasetID)
	if err != nil {
		return nil, fmt.Errorf("get dataset: %w", err)
	}
	if dataset == nil {
		return nil, fmt.Errorf("dataset not found")
	}

	items, err := e.pg.ListAllItems(ctx, orgID, datasetID)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}

	exportItems := make([]ExportItem, len(items))
	for i, item := range items {
		exportItems[i] = ExportItem{
			ID:       item.ID,
			Data:     item.Data,
			Metadata: item.Metadata,
		}
	}

	return &ExportResult{
		DatasetID:   dataset.ID,
		DatasetName: dataset.Name,
		ItemCount:   len(exportItems),
		Items:       exportItems,
	}, nil
}

// ExportDataOnly exports just the data fields as a JSON array (for compatibility with other tools).
func (e *Exporter) ExportDataOnly(ctx context.Context, orgID, datasetID string) (json.RawMessage, error) {
	items, err := e.pg.ListAllItems(ctx, orgID, datasetID)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}

	var dataOnly []json.RawMessage
	for _, item := range items {
		dataOnly = append(dataOnly, item.Data)
	}

	if dataOnly == nil {
		dataOnly = []json.RawMessage{}
	}

	result, err := json.Marshal(dataOnly)
	if err != nil {
		return nil, fmt.Errorf("marshal export: %w", err)
	}

	return result, nil
}
