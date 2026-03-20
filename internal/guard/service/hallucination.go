package service

// HallucinationResult holds the result of a hallucination check.
type HallucinationResult struct {
	Checked    bool    `json:"checked"`
	Confidence float64 `json:"confidence"`
	Detail     string  `json:"detail"`
}

// DetectHallucination is a stub — real hallucination detection requires an LLM
// to compare the output against grounding context. Returns not_checked.
func DetectHallucination(_ string, _ string) *HallucinationResult {
	return &HallucinationResult{
		Checked:    false,
		Confidence: 0,
		Detail:     "Hallucination detection requires LLM judge — not checked in programmatic mode",
	}
}
