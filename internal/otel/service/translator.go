package service

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/agentstack/agentstack/internal/trace/service"
	"github.com/google/uuid"
)

// OTLPExportTraceServiceRequest is the top-level OTLP JSON trace request.
type OTLPExportTraceServiceRequest struct {
	ResourceSpans []ResourceSpans `json:"resourceSpans"`
}

// ResourceSpans groups spans by resource.
type ResourceSpans struct {
	Resource   Resource     `json:"resource"`
	ScopeSpans []ScopeSpans `json:"scopeSpans"`
}

// Resource describes the entity producing telemetry.
type Resource struct {
	Attributes []KeyValue `json:"attributes"`
}

// ScopeSpans groups spans by instrumentation scope.
type ScopeSpans struct {
	Scope InstrumentationScope `json:"scope"`
	Spans []OTLPSpan           `json:"spans"`
}

// InstrumentationScope identifies the instrumentation library.
type InstrumentationScope struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// OTLPSpan is a single span in OTLP JSON format.
type OTLPSpan struct {
	TraceID            string     `json:"traceId"`
	SpanID             string     `json:"spanId"`
	ParentSpanID       string     `json:"parentSpanId"`
	Name               string     `json:"name"`
	Kind               int        `json:"kind"`
	StartTimeUnixNano  string     `json:"startTimeUnixNano"`
	EndTimeUnixNano    string     `json:"endTimeUnixNano"`
	Attributes         []KeyValue `json:"attributes"`
	Status             SpanStatus `json:"status"`
	Events             []SpanEvent `json:"events"`
}

// KeyValue is an OTLP attribute key-value pair.
type KeyValue struct {
	Key   string         `json:"key"`
	Value AttributeValue `json:"value"`
}

// AttributeValue holds a typed OTLP attribute value.
type AttributeValue struct {
	StringValue *string        `json:"stringValue,omitempty"`
	IntValue    *string        `json:"intValue,omitempty"`
	DoubleValue *float64       `json:"doubleValue,omitempty"`
	BoolValue   *bool          `json:"boolValue,omitempty"`
	ArrayValue  *ArrayValue    `json:"arrayValue,omitempty"`
}

// ArrayValue holds an array of OTLP values.
type ArrayValue struct {
	Values []AttributeValue `json:"values"`
}

// SpanStatus describes the span status.
type SpanStatus struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// SpanEvent is an event annotation on a span.
type SpanEvent struct {
	Name               string     `json:"name"`
	TimeUnixNano       string     `json:"timeUnixNano"`
	Attributes         []KeyValue `json:"attributes"`
}

// OTLPExportTraceServiceResponse is the response for the OTLP endpoint.
type OTLPExportTraceServiceResponse struct {
	PartialSuccess *PartialSuccess `json:"partialSuccess,omitempty"`
}

// PartialSuccess reports how many spans were rejected.
type PartialSuccess struct {
	RejectedSpans int64  `json:"rejectedSpans"`
	ErrorMessage  string `json:"errorMessage"`
}

// Translator converts OpenTelemetry spans to AgentStack native span format.
type Translator struct {
	logger *slog.Logger
}

// NewTranslator creates a new OTel span translator.
func NewTranslator(logger *slog.Logger) *Translator {
	return &Translator{logger: logger}
}

// TranslateTraceRequest converts an OTLP trace request into AgentStack span ingest requests.
func (t *Translator) TranslateTraceRequest(orgID string, req *OTLPExportTraceServiceRequest) ([]service.SpanIngestRequest, []service.SessionIngestRequest, error) {
	var spans []service.SpanIngestRequest
	var sessions []service.SessionIngestRequest
	sessionsSeen := make(map[string]bool)

	for _, rs := range req.ResourceSpans {
		// Extract resource attributes
		resourceAttrs := keyValuesToMap(rs.Resource.Attributes)
		agentName := ExtractStringAttr(resourceAttrs, AttrServiceName)
		agentID := ExtractStringAttr(resourceAttrs, AttrAgentStackAgentID)

		for _, ss := range rs.ScopeSpans {
			for _, span := range ss.Spans {
				// Convert OTel trace ID to session ID
				sessionID := traceIDToUUID(span.TraceID)
				spanID := spanIDToUUID(span.SpanID)
				parentID := spanIDToUUID(span.ParentSpanID)

				// Extract span attributes
				spanAttrs := keyValuesToMap(span.Attributes)

				// Merge resource-level agentstack attributes
				if v := ExtractStringAttr(resourceAttrs, AttrAgentStackSessionID); v != "" {
					sessionID = v
				}

				// Determine span type
				spanType := DetectSpanType(spanAttrs)

				// Map GenAI semantic conventions
				model := ExtractStringAttr(spanAttrs, AttrGenAIRequestModel)
				provider := ExtractStringAttr(spanAttrs, AttrGenAISystem)
				inputTokens := ExtractIntAttr(spanAttrs, AttrGenAIInputTokens)
				outputTokens := ExtractIntAttr(spanAttrs, AttrGenAIOutputTokens)
				totalTokens := inputTokens + outputTokens

				// Parse timestamps
				startedAt := nanoToTime(span.StartTimeUnixNano)
				endedAt := nanoToTime(span.EndTimeUnixNano)
				var durationMs uint64
				if !startedAt.IsZero() && !endedAt.IsZero() {
					durationMs = uint64(endedAt.Sub(startedAt).Milliseconds())
				}

				// Determine status
				status := "completed"
				if span.Status.Code == 2 { // ERROR
					status = "failed"
				}

				// Extract input/output from GenAI attributes
				input := ExtractStringAttr(spanAttrs, AttrGenAIPrompt)
				output := ExtractStringAttr(spanAttrs, AttrGenAICompletion)
				errMsg := span.Status.Message

				// Store remaining attributes as metadata
				metadata := buildMetadata(spanAttrs, resourceAttrs)

				ingestSpan := service.SpanIngestRequest{
					ID:           spanID,
					SessionID:    sessionID,
					OrgID:        orgID,
					ParentID:     parentID,
					Name:         span.Name,
					SpanType:     spanType,
					Status:       status,
					Input:        input,
					Output:       output,
					Error:        errMsg,
					Model:        model,
					Provider:     provider,
					InputTokens:  inputTokens,
					OutputTokens: outputTokens,
					TotalTokens:  totalTokens,
					DurationMs:   durationMs,
					Metadata:     metadata,
					StartedAt:    formatTime(startedAt),
					EndedAt:      formatTime(endedAt),
				}

				spans = append(spans, ingestSpan)

				// Create a session if we haven't seen this trace ID yet
				if !sessionsSeen[sessionID] {
					sessionsSeen[sessionID] = true
					sessions = append(sessions, service.SessionIngestRequest{
						ID:        sessionID,
						OrgID:     orgID,
						AgentName: agentName,
						AgentID:   agentID,
						Status:    status,
						StartedAt: formatTime(startedAt),
						EndedAt:   formatTime(endedAt),
					})
				}
			}
		}
	}

	return spans, sessions, nil
}

// keyValuesToMap converts OTLP KeyValue pairs to a flat map.
func keyValuesToMap(kvs []KeyValue) map[string]interface{} {
	m := make(map[string]interface{})
	for _, kv := range kvs {
		m[kv.Key] = attributeValueToInterface(kv.Value)
	}
	return m
}

// attributeValueToInterface converts an OTLP AttributeValue to a Go interface.
func attributeValueToInterface(av AttributeValue) interface{} {
	if av.StringValue != nil {
		return *av.StringValue
	}
	if av.IntValue != nil {
		return *av.IntValue
	}
	if av.DoubleValue != nil {
		return *av.DoubleValue
	}
	if av.BoolValue != nil {
		return *av.BoolValue
	}
	if av.ArrayValue != nil {
		var vals []interface{}
		for _, v := range av.ArrayValue.Values {
			vals = append(vals, attributeValueToInterface(v))
		}
		return vals
	}
	return nil
}

// traceIDToUUID converts a hex trace ID (32 chars) to a UUID string.
func traceIDToUUID(traceID string) string {
	if traceID == "" {
		return uuid.New().String()
	}
	// Pad to 32 chars if needed
	for len(traceID) < 32 {
		traceID = "0" + traceID
	}
	// Try to decode as hex and format as UUID
	b, err := hex.DecodeString(traceID)
	if err != nil || len(b) != 16 {
		return uuid.New().String()
	}
	u, err := uuid.FromBytes(b)
	if err != nil {
		return uuid.New().String()
	}
	return u.String()
}

// spanIDToUUID converts a hex span ID (16 chars) to a UUID string.
func spanIDToUUID(spanID string) string {
	if spanID == "" {
		return ""
	}
	// Pad to 16 chars
	for len(spanID) < 16 {
		spanID = "0" + spanID
	}
	// Pad with zeros to make 32 chars for UUID conversion
	fullHex := "00000000" + "0000" + "0000" + spanID
	b, err := hex.DecodeString(fullHex)
	if err != nil || len(b) != 16 {
		return uuid.New().String()
	}
	u, err := uuid.FromBytes(b)
	if err != nil {
		return uuid.New().String()
	}
	return u.String()
}

// nanoToTime converts a nanosecond unix timestamp string to time.Time.
func nanoToTime(nanos string) time.Time {
	if nanos == "" {
		return time.Time{}
	}
	n, err := strconv.ParseInt(nanos, 10, 64)
	if err != nil {
		return time.Time{}
	}
	return time.Unix(0, n)
}

// formatTime formats a time.Time to RFC3339 or returns empty string.
func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano)
}

// buildMetadata creates a JSON metadata string from span and resource attributes,
// excluding attributes that were already mapped to first-class fields.
func buildMetadata(spanAttrs, resourceAttrs map[string]interface{}) string {
	// Attributes that are mapped to first-class span fields
	mappedKeys := map[string]bool{
		AttrGenAISystem:         true,
		AttrGenAIRequestModel:   true,
		AttrGenAIInputTokens:    true,
		AttrGenAIOutputTokens:   true,
		AttrGenAIFinishReasons:  true,
		AttrGenAIPrompt:         true,
		AttrGenAICompletion:     true,
		AttrAgentStackOrgID:     true,
		AttrAgentStackAgentID:   true,
		AttrAgentStackSessionID: true,
		AttrAgentStackSpanType:  true,
		AttrServiceName:         true,
	}

	meta := map[string]interface{}{
		"source": "otel",
	}

	// Add unmapped span attributes
	for k, v := range spanAttrs {
		if !mappedKeys[k] {
			meta[fmt.Sprintf("otel.span.%s", k)] = v
		}
	}

	// Add unmapped resource attributes
	for k, v := range resourceAttrs {
		if !mappedKeys[k] {
			meta[fmt.Sprintf("otel.resource.%s", k)] = v
		}
	}

	data, err := json.Marshal(meta)
	if err != nil {
		return `{"source":"otel"}`
	}
	return string(data)
}
