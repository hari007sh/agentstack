package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/agentstack/agentstack/internal/guard/store"
)

// GuardResult represents the result of a single guardrail check.
type GuardResult struct {
	GuardrailID string          `json:"guardrail_id"`
	Type        string          `json:"type"`
	Action      string          `json:"action"` // passed, blocked, warned, not_checked
	Findings    json.RawMessage `json:"findings"`
	LatencyMs   int64           `json:"latency_ms"`
}

// CheckResponse is the full response for a guard check.
type CheckResponse struct {
	Passed  bool          `json:"passed"`
	Results []GuardResult `json:"results"`
}

// Engine runs guardrails in parallel and aggregates results.
type Engine struct {
	store  *store.PostgresStore
	logger *slog.Logger
}

// NewEngine creates a new guard engine.
func NewEngine(store *store.PostgresStore, logger *slog.Logger) *Engine {
	return &Engine{store: store, logger: logger}
}

// RunGuards executes guardrails against content in parallel.
// If guardrailIDs is empty, all active guardrails matching the direction are used.
// Short-circuits on first block (if the guardrail mode is "block").
func (e *Engine) RunGuards(ctx context.Context, orgID, content, direction string, guardrailIDs []string) (*CheckResponse, error) {
	// Load guardrails
	var guardrails []store.Guardrail
	var err error

	if len(guardrailIDs) > 0 {
		guardrails, err = e.store.ListGuardrailsByIDs(ctx, orgID, guardrailIDs)
	} else {
		guardrails, err = e.store.ListActiveGuardrails(ctx, orgID, direction)
	}
	if err != nil {
		return nil, fmt.Errorf("load guardrails: %w", err)
	}

	if len(guardrails) == 0 {
		return &CheckResponse{
			Passed:  true,
			Results: []GuardResult{},
		}, nil
	}

	// Run all guards in parallel
	type guardOutput struct {
		result GuardResult
		mode   string
	}

	resultCh := make(chan guardOutput, len(guardrails))
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	for _, g := range guardrails {
		if !g.Enabled {
			continue
		}
		wg.Add(1)
		go func(g store.Guardrail) {
			defer wg.Done()

			start := time.Now()
			result := e.runSingleGuard(ctx, g, content)
			result.LatencyMs = time.Since(start).Milliseconds()

			select {
			case resultCh <- guardOutput{result: result, mode: g.Mode}:
			case <-ctx.Done():
			}
		}(g)
	}

	// Close channel when all goroutines complete
	go func() {
		wg.Wait()
		close(resultCh)
	}()

	// Collect results
	response := &CheckResponse{
		Passed:  true,
		Results: []GuardResult{},
	}

	for out := range resultCh {
		response.Results = append(response.Results, out.result)

		if out.result.Action == "blocked" {
			response.Passed = false
			// Short-circuit on block: cancel remaining guards
			cancel()
			// Drain remaining results that already completed
			for remaining := range resultCh {
				response.Results = append(response.Results, remaining.result)
			}
			return response, nil
		}
		if out.result.Action == "warned" {
			// Warnings don't fail the check but are reported
		}
	}

	return response, nil
}

// runSingleGuard executes a single guardrail check against the content.
func (e *Engine) runSingleGuard(ctx context.Context, g store.Guardrail, content string) GuardResult {
	select {
	case <-ctx.Done():
		return GuardResult{
			GuardrailID: g.ID,
			Type:        g.Type,
			Action:      "passed",
			Findings:    json.RawMessage(`{"skipped": "context cancelled"}`),
		}
	default:
	}

	switch g.Type {
	case "pii":
		return e.runPII(g, content)
	case "injection", "prompt_injection":
		return e.runInjection(g, content)
	case "toxicity":
		return e.runToxicity(g, content)
	case "hallucination":
		return e.runHallucination(g, content)
	case "topic":
		return e.runTopic(g, content)
	case "code_exec", "code_execution":
		return e.runCodeExec(g, content)
	case "length":
		return e.runLength(g, content)
	case "custom", "custom_policy":
		return e.runCustom(g, content)
	default:
		e.logger.Warn("unknown guard type", "type", g.Type, "guardrail_id", g.ID)
		return GuardResult{
			GuardrailID: g.ID,
			Type:        g.Type,
			Action:      "passed",
			Findings:    json.RawMessage(`{"error": "unknown guard type"}`),
		}
	}
}

func (e *Engine) runPII(g store.Guardrail, content string) GuardResult {
	// Parse detect types from config
	detectTypes := AllPIITypes
	var cfg map[string]interface{}
	if err := json.Unmarshal(g.Config, &cfg); err == nil {
		if dt, ok := cfg["detect"].([]interface{}); ok {
			detectTypes = make([]string, 0, len(dt))
			for _, t := range dt {
				if s, ok := t.(string); ok {
					detectTypes = append(detectTypes, s)
				}
			}
		}
	}

	matches := DetectPII(content, detectTypes)
	if len(matches) == 0 {
		return makePassedResult(g)
	}

	// Build findings
	findings := map[string]interface{}{
		"pii_items": matches,
		"count":     len(matches),
	}
	findingsJSON, _ := json.Marshal(findings)

	// Determine action from mode
	action := modeToAction(g.Mode)

	typeCounts := make(map[string]int)
	for _, m := range matches {
		typeCounts[m.Type]++
	}
	details := make([]string, 0, len(typeCounts))
	for t, count := range typeCounts {
		details = append(details, fmt.Sprintf("%d %s", count, t))
	}

	findingsWithDetail := map[string]interface{}{
		"pii_items": matches,
		"count":     len(matches),
		"detail":    fmt.Sprintf("PII detected: %s", strings.Join(details, ", ")),
	}
	findingsJSON, _ = json.Marshal(findingsWithDetail)

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "pii",
		Action:      action,
		Findings:    findingsJSON,
	}
}

func (e *Engine) runInjection(g store.Guardrail, content string) GuardResult {
	findings := DetectInjection(content)
	if len(findings) == 0 {
		return makePassedResult(g)
	}

	detail := DescribeInjection(findings)
	findingsJSON, _ := json.Marshal(map[string]interface{}{
		"patterns": findings,
		"count":    len(findings),
		"detail":   detail,
	})

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "injection",
		Action:      modeToAction(g.Mode),
		Findings:    findingsJSON,
	}
}

func (e *Engine) runToxicity(g store.Guardrail, content string) GuardResult {
	// Parse categories from config
	var categories []string
	var cfg map[string]interface{}
	if err := json.Unmarshal(g.Config, &cfg); err == nil {
		if cats, ok := cfg["categories"].([]interface{}); ok {
			for _, c := range cats {
				if s, ok := c.(string); ok {
					categories = append(categories, s)
				}
			}
		}
	}

	findings := DetectToxicity(content, categories)
	if len(findings) == 0 {
		return makePassedResult(g)
	}

	detail := DescribeToxicity(findings)
	findingsJSON, _ := json.Marshal(map[string]interface{}{
		"categories": findings,
		"count":      len(findings),
		"detail":     detail,
	})

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "toxicity",
		Action:      modeToAction(g.Mode),
		Findings:    findingsJSON,
	}
}

func (e *Engine) runHallucination(g store.Guardrail, content string) GuardResult {
	result := DetectHallucination(content, "")

	findingsJSON, _ := json.Marshal(map[string]interface{}{
		"checked": result.Checked,
		"detail":  result.Detail,
	})

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "hallucination",
		Action:      "not_checked",
		Findings:    findingsJSON,
	}
}

func (e *Engine) runTopic(g store.Guardrail, content string) GuardResult {
	var allowedTopics, blockedTopics []string
	var cfg map[string]interface{}
	if err := json.Unmarshal(g.Config, &cfg); err == nil {
		if at, ok := cfg["allowed_topics"].([]interface{}); ok {
			for _, t := range at {
				if s, ok := t.(string); ok {
					allowedTopics = append(allowedTopics, s)
				}
			}
		}
		if bt, ok := cfg["blocked_topics"].([]interface{}); ok {
			for _, t := range bt {
				if s, ok := t.(string); ok {
					blockedTopics = append(blockedTopics, s)
				}
			}
		}
	}

	result := CheckTopic(content, allowedTopics, blockedTopics)

	findingsJSON, _ := json.Marshal(map[string]interface{}{
		"checked": result.Checked,
		"detail":  result.Detail,
	})

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "topic",
		Action:      "not_checked",
		Findings:    findingsJSON,
	}
}

func (e *Engine) runCodeExec(g store.Guardrail, content string) GuardResult {
	// Parse custom patterns from config
	var customPatterns []string
	var cfg map[string]interface{}
	if err := json.Unmarshal(g.Config, &cfg); err == nil {
		if bp, ok := cfg["block_patterns"].([]interface{}); ok {
			for _, p := range bp {
				if s, ok := p.(string); ok {
					customPatterns = append(customPatterns, s)
				}
			}
		}
	}

	findings := DetectCodeExec(content, customPatterns)
	if len(findings) == 0 {
		return makePassedResult(g)
	}

	detail := DescribeCodeExec(findings)
	findingsJSON, _ := json.Marshal(map[string]interface{}{
		"patterns": findings,
		"count":    len(findings),
		"detail":   detail,
	})

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "code_exec",
		Action:      modeToAction(g.Mode),
		Findings:    findingsJSON,
	}
}

func (e *Engine) runLength(g store.Guardrail, content string) GuardResult {
	// Parse length config
	var cfg map[string]interface{}
	lengthCfg := LengthConfig{}
	if err := json.Unmarshal(g.Config, &cfg); err == nil {
		if v, ok := cfg["min_chars"].(float64); ok {
			i := int(v)
			lengthCfg.MinChars = &i
		}
		if v, ok := cfg["max_chars"].(float64); ok {
			i := int(v)
			lengthCfg.MaxChars = &i
		}
		if v, ok := cfg["min_tokens"].(float64); ok {
			i := int(v)
			lengthCfg.MinTokens = &i
		}
		if v, ok := cfg["max_tokens"].(float64); ok {
			i := int(v)
			lengthCfg.MaxTokens = &i
		}
	}

	result := CheckLength(content, lengthCfg)
	if result.Passed {
		return makePassedResult(g)
	}

	findingsJSON, _ := json.Marshal(map[string]interface{}{
		"violation":  result.Violation,
		"char_count": result.CharCount,
		"word_count": result.WordCount,
	})

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "length",
		Action:      modeToAction(g.Mode),
		Findings:    findingsJSON,
	}
}

func (e *Engine) runCustom(g store.Guardrail, content string) GuardResult {
	var policyPrompt string
	var cfg map[string]interface{}
	if err := json.Unmarshal(g.Config, &cfg); err == nil {
		if pp, ok := cfg["policy_prompt"].(string); ok {
			policyPrompt = pp
		}
	}

	result := CheckCustomPolicy(content, policyPrompt)

	findingsJSON, _ := json.Marshal(map[string]interface{}{
		"checked": result.Checked,
		"detail":  result.Detail,
	})

	return GuardResult{
		GuardrailID: g.ID,
		Type:        "custom",
		Action:      "not_checked",
		Findings:    findingsJSON,
	}
}

// modeToAction converts guardrail mode to the action string for results.
func modeToAction(mode string) string {
	switch mode {
	case "block":
		return "blocked"
	case "warn":
		return "warned"
	case "log":
		return "warned" // logged events are treated as warnings in results
	default:
		return "blocked"
	}
}

// makePassedResult creates a passed result for a guardrail.
func makePassedResult(g store.Guardrail) GuardResult {
	return GuardResult{
		GuardrailID: g.ID,
		Type:        g.Type,
		Action:      "passed",
		Findings:    json.RawMessage(`{}`),
	}
}
