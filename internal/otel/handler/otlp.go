// Package handler provides HTTP handlers for the OTel module.
package handler

import (
	"log/slog"
	"net/http"

	otelservice "github.com/agentstack/agentstack/internal/otel/service"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/trace/service"
)

// OTLPHandler handles OTLP trace ingestion endpoints.
type OTLPHandler struct {
	translator *otelservice.Translator
	ingestSvc  *service.IngestService
	logger     *slog.Logger
}

// NewOTLPHandler creates a new OTLP handler.
func NewOTLPHandler(translator *otelservice.Translator, ingestSvc *service.IngestService, logger *slog.Logger) *OTLPHandler {
	return &OTLPHandler{
		translator: translator,
		ingestSvc:  ingestSvc,
		logger:     logger,
	}
}

// ReceiveTraces handles POST /v1/otlp/v1/traces.
// Accepts OTLP/HTTP JSON trace exports, translates them to AgentStack spans,
// and publishes to the existing NATS trace ingestion pipeline.
func (h *OTLPHandler) ReceiveTraces(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req otelservice.OTLPExportTraceServiceRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid OTLP JSON request body")
		return
	}

	if len(req.ResourceSpans) == 0 {
		// Empty request is valid per OTLP spec
		httputil.WriteJSON(w, http.StatusOK, otelservice.OTLPExportTraceServiceResponse{
			PartialSuccess: &otelservice.PartialSuccess{},
		})
		return
	}

	// Translate OTel spans to AgentStack format
	spans, sessions, err := h.translator.TranslateTraceRequest(orgID, &req)
	if err != nil {
		h.logger.Error("failed to translate OTLP traces", "error", err)
		httputil.WriteError(w, http.StatusBadRequest, "TRANSLATE_ERROR", "failed to translate OTLP traces")
		return
	}

	var rejectedSpans int64

	// Publish sessions to NATS
	for _, sess := range sessions {
		sess.OrgID = orgID
		if err := h.ingestSvc.IngestSession(orgID, &sess); err != nil {
			h.logger.Error("failed to ingest OTel session", "session_id", sess.ID, "error", err)
			// Don't fail the whole request for a single session
		}
	}

	// Publish spans to NATS (one at a time to track rejections)
	for _, span := range spans {
		span.OrgID = orgID
		if err := h.ingestSvc.IngestSpans(orgID, []service.SpanIngestRequest{span}); err != nil {
			h.logger.Error("failed to ingest OTel span", "span_id", span.ID, "error", err)
			rejectedSpans++
		}
	}

	h.logger.Info("OTLP traces received",
		"org_id", orgID,
		"resource_spans", len(req.ResourceSpans),
		"translated_spans", len(spans),
		"translated_sessions", len(sessions),
		"rejected_spans", rejectedSpans,
	)

	httputil.WriteJSON(w, http.StatusOK, otelservice.OTLPExportTraceServiceResponse{
		PartialSuccess: &otelservice.PartialSuccess{
			RejectedSpans: rejectedSpans,
		},
	})
}
