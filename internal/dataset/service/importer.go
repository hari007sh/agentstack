package service

import (
	"bufio"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"

	"github.com/agentstack/agentstack/internal/dataset/store"
)

const (
	maxImportItems = 10000
	maxFileSize    = 10 * 1024 * 1024 // 10MB
)

// Importer handles CSV, JSON, and JSONL file imports into datasets.
type Importer struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewImporter creates a new Importer.
func NewImporter(pg *store.PostgresStore, logger *slog.Logger) *Importer {
	return &Importer{pg: pg, logger: logger}
}

// ImportCSV parses a CSV file and inserts rows as dataset items.
// The first row is treated as headers. If mapping is provided, column names
// are remapped; otherwise headers are used as-is.
func (imp *Importer) ImportCSV(ctx context.Context, orgID, datasetID string, reader io.Reader, mapping map[string]string) (int, error) {
	csvReader := csv.NewReader(reader)
	csvReader.LazyQuotes = true
	csvReader.TrimLeadingSpace = true

	// Read header row
	headers, err := csvReader.Read()
	if err != nil {
		return 0, fmt.Errorf("read CSV headers: %w", err)
	}

	var items []store.DatasetItem
	rowNum := 0

	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, fmt.Errorf("read CSV row %d: %w", rowNum+1, err)
		}

		rowNum++
		if rowNum > maxImportItems {
			return 0, fmt.Errorf("import exceeds maximum of %d items", maxImportItems)
		}

		row := make(map[string]interface{})
		for i, header := range headers {
			if i < len(record) {
				key := header
				if mapping != nil {
					if mapped, ok := mapping[header]; ok {
						key = mapped
					}
				}
				row[key] = record[i]
			}
		}

		data, err := json.Marshal(row)
		if err != nil {
			return 0, fmt.Errorf("marshal row %d: %w", rowNum, err)
		}

		meta, _ := json.Marshal(map[string]interface{}{
			"import_format": "csv",
			"import_row":    rowNum,
		})

		items = append(items, store.DatasetItem{
			DatasetID: datasetID,
			OrgID:     orgID,
			Data:      data,
			Metadata:  meta,
		})
	}

	if len(items) == 0 {
		return 0, nil
	}

	// Batch insert
	if err := imp.pg.CreateItemsBatch(ctx, items); err != nil {
		return 0, fmt.Errorf("batch insert: %w", err)
	}

	// Update item count
	if err := imp.pg.IncrementItemCount(ctx, orgID, datasetID, len(items)); err != nil {
		imp.logger.Error("failed to update item count after import", "error", err)
	}

	return len(items), nil
}

// ImportJSON parses a JSON array of objects and inserts them as dataset items.
func (imp *Importer) ImportJSON(ctx context.Context, orgID, datasetID string, reader io.Reader) (int, error) {
	limitedReader := io.LimitReader(reader, maxFileSize+1)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return 0, fmt.Errorf("read JSON: %w", err)
	}
	if len(data) > maxFileSize {
		return 0, fmt.Errorf("file exceeds maximum size of %d bytes", maxFileSize)
	}

	var rows []json.RawMessage
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, fmt.Errorf("parse JSON array: %w", err)
	}

	if len(rows) > maxImportItems {
		return 0, fmt.Errorf("import exceeds maximum of %d items", maxImportItems)
	}

	var items []store.DatasetItem
	for i, row := range rows {
		meta, _ := json.Marshal(map[string]interface{}{
			"import_format": "json",
			"import_row":    i + 1,
		})
		items = append(items, store.DatasetItem{
			DatasetID: datasetID,
			OrgID:     orgID,
			Data:      row,
			Metadata:  meta,
		})
	}

	if len(items) == 0 {
		return 0, nil
	}

	if err := imp.pg.CreateItemsBatch(ctx, items); err != nil {
		return 0, fmt.Errorf("batch insert: %w", err)
	}

	if err := imp.pg.IncrementItemCount(ctx, orgID, datasetID, len(items)); err != nil {
		imp.logger.Error("failed to update item count after import", "error", err)
	}

	return len(items), nil
}

// ImportJSONL parses a JSONL (one JSON object per line) file and inserts items.
func (imp *Importer) ImportJSONL(ctx context.Context, orgID, datasetID string, reader io.Reader) (int, error) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024) // 1MB line buffer

	var items []store.DatasetItem
	lineNum := 0

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		lineNum++
		if lineNum > maxImportItems {
			return 0, fmt.Errorf("import exceeds maximum of %d items", maxImportItems)
		}

		// Validate it's valid JSON
		var obj json.RawMessage
		if err := json.Unmarshal(line, &obj); err != nil {
			return 0, fmt.Errorf("parse JSONL line %d: %w", lineNum, err)
		}

		meta, _ := json.Marshal(map[string]interface{}{
			"import_format": "jsonl",
			"import_row":    lineNum,
		})

		dataCopy := make(json.RawMessage, len(line))
		copy(dataCopy, line)

		items = append(items, store.DatasetItem{
			DatasetID: datasetID,
			OrgID:     orgID,
			Data:      dataCopy,
			Metadata:  meta,
		})
	}

	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("read JSONL: %w", err)
	}

	if len(items) == 0 {
		return 0, nil
	}

	if err := imp.pg.CreateItemsBatch(ctx, items); err != nil {
		return 0, fmt.Errorf("batch insert: %w", err)
	}

	if err := imp.pg.IncrementItemCount(ctx, orgID, datasetID, len(items)); err != nil {
		imp.logger.Error("failed to update item count after import", "error", err)
	}

	return len(items), nil
}
