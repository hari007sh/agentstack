// Package service provides OTel span translation and attribute mapping.
package service

// GenAI Semantic Convention attribute keys.
// See: https://opentelemetry.io/docs/specs/semconv/gen-ai/
const (
	AttrGenAISystem        = "gen_ai.system"
	AttrGenAIRequestModel  = "gen_ai.request.model"
	AttrGenAIInputTokens   = "gen_ai.usage.input_tokens"
	AttrGenAIOutputTokens  = "gen_ai.usage.output_tokens"
	AttrGenAIFinishReasons = "gen_ai.response.finish_reasons"
	AttrGenAIPrompt        = "gen_ai.prompt"
	AttrGenAICompletion    = "gen_ai.completion"
	AttrGenAITemperature   = "gen_ai.request.temperature"
	AttrGenAIMaxTokens     = "gen_ai.request.max_tokens"
)

// Standard OTel resource/span attribute keys.
const (
	AttrServiceName = "service.name"
	AttrRPCSystem   = "rpc.system"
)

// AgentStack custom attributes used in OTel spans.
const (
	AttrAgentStackOrgID      = "agentstack.org.id"
	AttrAgentStackAgentID    = "agentstack.agent.id"
	AttrAgentStackSessionID  = "agentstack.session.id"
	AttrAgentStackSpanType   = "agentstack.span.type"
	AttrAgentStackPromptID   = "agentstack.prompt.id"
	AttrAgentStackPromptVer  = "agentstack.prompt.version"
)

// DetectSpanType infers the AgentStack span type from OTel attributes.
func DetectSpanType(attrs map[string]interface{}) string {
	// If agentstack.span.type is explicitly set, use it
	if v, ok := attrs[AttrAgentStackSpanType]; ok {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}

	// If gen_ai.system is present, it's an LLM call
	if _, ok := attrs[AttrGenAISystem]; ok {
		return "llm_call"
	}

	// If rpc.system == "tool", it's a tool call
	if v, ok := attrs[AttrRPCSystem]; ok {
		if s, ok := v.(string); ok && s == "tool" {
			return "tool_call"
		}
	}

	return "custom"
}

// ExtractStringAttr extracts a string attribute value from a map.
func ExtractStringAttr(attrs map[string]interface{}, key string) string {
	if v, ok := attrs[key]; ok {
		switch val := v.(type) {
		case string:
			return val
		}
	}
	return ""
}

// ExtractIntAttr extracts an integer attribute value from a map.
// Handles both int and float64 (from JSON parsing) and string values.
func ExtractIntAttr(attrs map[string]interface{}, key string) uint32 {
	if v, ok := attrs[key]; ok {
		switch val := v.(type) {
		case float64:
			return uint32(val)
		case int:
			return uint32(val)
		case int64:
			return uint32(val)
		case string:
			// OTel JSON encodes some ints as strings (e.g., intValue)
			var n uint32
			for _, c := range val {
				if c >= '0' && c <= '9' {
					n = n*10 + uint32(c-'0')
				}
			}
			return n
		}
	}
	return 0
}
