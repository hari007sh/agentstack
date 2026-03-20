// Package service provides the business logic for the Test module.
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"regexp"
	"strings"
)

// EvaluatorService runs evaluators against test case outputs.
type EvaluatorService struct {
	logger *slog.Logger
}

// NewEvaluatorService creates a new evaluator service.
func NewEvaluatorService(logger *slog.Logger) *EvaluatorService {
	return &EvaluatorService{logger: logger}
}

// EvalInput holds all the data needed to run an evaluator.
type EvalInput struct {
	Input          json.RawMessage `json:"input"`
	Output         string          `json:"output"`
	ExpectedOutput json.RawMessage `json:"expected_output,omitempty"`
	Context        json.RawMessage `json:"context,omitempty"`
	DurationMs     int64           `json:"duration_ms,omitempty"`
	TokensUsed     int             `json:"tokens_used,omitempty"`
	CostCents      int64           `json:"cost_cents,omitempty"`
}

// EvalResult is the outcome of running a single evaluator.
type EvalResult struct {
	EvaluatorName string  `json:"evaluator_name"`
	Score         float64 `json:"score"`
	Passed        bool    `json:"passed"`
	Reasoning     string  `json:"reasoning"`
	Error         string  `json:"error,omitempty"`
}

// Evaluate runs a single evaluator and returns the result.
func (s *EvaluatorService) Evaluate(ctx context.Context, evalType, evalSubtype string, config json.RawMessage, input EvalInput) EvalResult {
	switch evalType {
	case "programmatic":
		return s.evaluateProgrammatic(ctx, evalSubtype, config, input)
	case "llm_judge":
		return s.evaluateLLMJudge(ctx, evalSubtype, config, input)
	case "composite":
		return s.evaluateComposite(ctx, evalSubtype, config, input)
	default:
		return EvalResult{
			EvaluatorName: evalSubtype,
			Score:         0,
			Passed:        false,
			Reasoning:     fmt.Sprintf("unknown evaluator type: %s", evalType),
		}
	}
}

// evaluateProgrammatic runs a programmatic evaluator that does not require an LLM.
func (s *EvaluatorService) evaluateProgrammatic(_ context.Context, subtype string, config json.RawMessage, input EvalInput) EvalResult {
	result := EvalResult{EvaluatorName: subtype}

	switch subtype {
	case "json_valid", "json_validity":
		result = s.checkJSONValid(input)
	case "latency_threshold", "latency_check":
		result = s.checkLatency(config, input)
	case "token_limit", "token_count":
		result = s.checkTokenLimit(config, input)
	case "regex_match":
		result = s.checkRegexMatch(config, input)
	case "contains_keywords":
		result = s.checkContainsKeywords(config, input)
	case "cost_threshold":
		result = s.checkCostThreshold(config, input)
	case "length_check":
		result = s.checkLength(config, input)
	default:
		result.Reasoning = fmt.Sprintf("unknown programmatic evaluator subtype: %s", subtype)
	}

	result.EvaluatorName = subtype
	return result
}

// checkJSONValid checks if the output is valid JSON.
func (s *EvaluatorService) checkJSONValid(input EvalInput) EvalResult {
	var js json.RawMessage
	if err := json.Unmarshal([]byte(input.Output), &js); err != nil {
		return EvalResult{
			Score:     0,
			Passed:    false,
			Reasoning: fmt.Sprintf("output is not valid JSON: %s", err.Error()),
		}
	}
	return EvalResult{
		Score:     1.0,
		Passed:    true,
		Reasoning: "output is valid JSON",
	}
}

// checkLatency checks if the duration is within the threshold.
func (s *EvaluatorService) checkLatency(config json.RawMessage, input EvalInput) EvalResult {
	var cfg struct {
		DefaultMaxDurationMs int64 `json:"default_max_duration_ms"`
	}
	cfg.DefaultMaxDurationMs = 30000
	if config != nil {
		json.Unmarshal(config, &cfg)
	}

	if input.DurationMs <= cfg.DefaultMaxDurationMs {
		return EvalResult{
			Score:     1.0,
			Passed:    true,
			Reasoning: fmt.Sprintf("duration %dms is within threshold %dms", input.DurationMs, cfg.DefaultMaxDurationMs),
		}
	}
	return EvalResult{
		Score:     0,
		Passed:    false,
		Reasoning: fmt.Sprintf("duration %dms exceeds threshold %dms", input.DurationMs, cfg.DefaultMaxDurationMs),
	}
}

// checkTokenLimit checks if the token count is within bounds.
func (s *EvaluatorService) checkTokenLimit(config json.RawMessage, input EvalInput) EvalResult {
	var cfg struct {
		DefaultMinTokens int `json:"default_min_tokens"`
		DefaultMaxTokens int `json:"default_max_tokens"`
	}
	cfg.DefaultMinTokens = 1
	cfg.DefaultMaxTokens = 4096
	if config != nil {
		json.Unmarshal(config, &cfg)
	}

	// Estimate tokens by word count if not provided (rough approximation)
	tokens := input.TokensUsed
	if tokens == 0 {
		tokens = len(strings.Fields(input.Output))
	}

	if tokens >= cfg.DefaultMinTokens && tokens <= cfg.DefaultMaxTokens {
		return EvalResult{
			Score:     1.0,
			Passed:    true,
			Reasoning: fmt.Sprintf("token count %d is within range [%d, %d]", tokens, cfg.DefaultMinTokens, cfg.DefaultMaxTokens),
		}
	}
	return EvalResult{
		Score:     0,
		Passed:    false,
		Reasoning: fmt.Sprintf("token count %d is outside range [%d, %d]", tokens, cfg.DefaultMinTokens, cfg.DefaultMaxTokens),
	}
}

// checkRegexMatch checks if the output matches a regex pattern.
func (s *EvaluatorService) checkRegexMatch(config json.RawMessage, input EvalInput) EvalResult {
	var cfg struct {
		Pattern string `json:"pattern"`
	}
	if config != nil {
		json.Unmarshal(config, &cfg)
	}

	if cfg.Pattern == "" {
		// Try to get pattern from expected_output
		if input.ExpectedOutput != nil {
			var expected struct {
				Pattern string `json:"pattern"`
			}
			json.Unmarshal(input.ExpectedOutput, &expected)
			cfg.Pattern = expected.Pattern
		}
	}

	if cfg.Pattern == "" {
		return EvalResult{
			Score:     0,
			Passed:    false,
			Reasoning: "no regex pattern configured",
		}
	}

	re, err := regexp.Compile(cfg.Pattern)
	if err != nil {
		return EvalResult{
			Score:     0,
			Passed:    false,
			Reasoning: fmt.Sprintf("invalid regex pattern: %s", err.Error()),
		}
	}

	if re.MatchString(input.Output) {
		return EvalResult{
			Score:     1.0,
			Passed:    true,
			Reasoning: fmt.Sprintf("output matches pattern: %s", cfg.Pattern),
		}
	}
	return EvalResult{
		Score:     0,
		Passed:    false,
		Reasoning: fmt.Sprintf("output does not match pattern: %s", cfg.Pattern),
	}
}

// checkContainsKeywords checks whether required keywords are present.
func (s *EvaluatorService) checkContainsKeywords(config json.RawMessage, input EvalInput) EvalResult {
	var cfg struct {
		MustContain    []string `json:"must_contain"`
		MustNotContain []string `json:"must_not_contain"`
	}
	if config != nil {
		json.Unmarshal(config, &cfg)
	}

	// Also check expected_output for keywords
	if input.ExpectedOutput != nil {
		var expected struct {
			MustContain    []string `json:"must_contain"`
			MustNotContain []string `json:"must_not_contain"`
		}
		json.Unmarshal(input.ExpectedOutput, &expected)
		if len(expected.MustContain) > 0 {
			cfg.MustContain = append(cfg.MustContain, expected.MustContain...)
		}
		if len(expected.MustNotContain) > 0 {
			cfg.MustNotContain = append(cfg.MustNotContain, expected.MustNotContain...)
		}
	}

	totalChecks := len(cfg.MustContain) + len(cfg.MustNotContain)
	if totalChecks == 0 {
		return EvalResult{
			Score:     1.0,
			Passed:    true,
			Reasoning: "no keywords to check",
		}
	}

	passedChecks := 0
	var failures []string
	outputLower := strings.ToLower(input.Output)

	for _, kw := range cfg.MustContain {
		if strings.Contains(outputLower, strings.ToLower(kw)) {
			passedChecks++
		} else {
			failures = append(failures, fmt.Sprintf("missing required keyword: %q", kw))
		}
	}

	for _, kw := range cfg.MustNotContain {
		if !strings.Contains(outputLower, strings.ToLower(kw)) {
			passedChecks++
		} else {
			failures = append(failures, fmt.Sprintf("found forbidden keyword: %q", kw))
		}
	}

	score := float64(passedChecks) / float64(totalChecks)
	reasoning := fmt.Sprintf("%d/%d keyword checks passed", passedChecks, totalChecks)
	if len(failures) > 0 {
		reasoning += "; " + strings.Join(failures, "; ")
	}

	return EvalResult{
		Score:     score,
		Passed:    score >= 1.0,
		Reasoning: reasoning,
	}
}

// checkCostThreshold checks if the cost is within the threshold.
func (s *EvaluatorService) checkCostThreshold(config json.RawMessage, input EvalInput) EvalResult {
	var cfg struct {
		DefaultMaxCostCents int64 `json:"default_max_cost_cents"`
	}
	cfg.DefaultMaxCostCents = 100
	if config != nil {
		json.Unmarshal(config, &cfg)
	}

	if input.CostCents <= cfg.DefaultMaxCostCents {
		return EvalResult{
			Score:     1.0,
			Passed:    true,
			Reasoning: fmt.Sprintf("cost %d cents is within threshold %d cents", input.CostCents, cfg.DefaultMaxCostCents),
		}
	}
	return EvalResult{
		Score:     0,
		Passed:    false,
		Reasoning: fmt.Sprintf("cost %d cents exceeds threshold %d cents", input.CostCents, cfg.DefaultMaxCostCents),
	}
}

// checkLength checks if the output length is within bounds.
func (s *EvaluatorService) checkLength(config json.RawMessage, input EvalInput) EvalResult {
	var cfg struct {
		MinLength int `json:"min_length"`
		MaxLength int `json:"max_length"`
	}
	cfg.MinLength = 1
	cfg.MaxLength = 100000
	if config != nil {
		json.Unmarshal(config, &cfg)
	}

	length := len(input.Output)
	if length >= cfg.MinLength && length <= cfg.MaxLength {
		return EvalResult{
			Score:     1.0,
			Passed:    true,
			Reasoning: fmt.Sprintf("output length %d is within range [%d, %d]", length, cfg.MinLength, cfg.MaxLength),
		}
	}
	return EvalResult{
		Score:     0,
		Passed:    false,
		Reasoning: fmt.Sprintf("output length %d is outside range [%d, %d]", length, cfg.MinLength, cfg.MaxLength),
	}
}

// evaluateLLMJudge is a stub for LLM-based evaluation.
// In production, this would call the user's configured LLM API key.
func (s *EvaluatorService) evaluateLLMJudge(_ context.Context, subtype string, _ json.RawMessage, _ EvalInput) EvalResult {
	s.logger.Info("LLM judge evaluator called (stub)", "subtype", subtype)

	// Stub: return a simulated score. In production, this would call
	// the user's LLM API and parse the JSON response.
	return EvalResult{
		EvaluatorName: subtype,
		Score:         0.85,
		Passed:        true,
		Reasoning:     fmt.Sprintf("LLM judge evaluation (stub) for %s — in production, this calls the user's configured LLM", subtype),
	}
}

// evaluateComposite combines scores from multiple evaluators.
func (s *EvaluatorService) evaluateComposite(_ context.Context, subtype string, config json.RawMessage, _ EvalInput) EvalResult {
	var cfg struct {
		Aggregation string    `json:"aggregation"`
		Weights     []float64 `json:"weights"`
	}
	if config != nil {
		json.Unmarshal(config, &cfg)
	}

	// Stub: in production, this would run sub-evaluators and aggregate.
	var score float64
	var reasoning string

	switch cfg.Aggregation {
	case "multiply":
		score = math.Pow(0.85, 2) // Simulated compound reliability
		reasoning = fmt.Sprintf("composite (%s): multiplied sub-evaluator scores (stub)", subtype)
	case "quality_per_cost":
		score = 0.75
		reasoning = fmt.Sprintf("composite (%s): quality per cost ratio (stub)", subtype)
	case "weighted_average":
		score = 0.82
		reasoning = fmt.Sprintf("composite (%s): weighted average of sub-evaluators (stub)", subtype)
	default:
		score = 0.80
		reasoning = fmt.Sprintf("composite (%s): default aggregation (stub)", subtype)
	}

	return EvalResult{
		EvaluatorName: subtype,
		Score:         score,
		Passed:        score >= 0.7,
		Reasoning:     reasoning,
	}
}
