package service

// CustomPolicyResult holds the result of a custom policy guard check.
type CustomPolicyResult struct {
	Checked    bool    `json:"checked"`
	Confidence float64 `json:"confidence"`
	Detail     string  `json:"detail"`
}

// CheckCustomPolicy is a stub — custom policy guards require an LLM
// to evaluate text against a user-defined policy prompt. Returns not_checked.
func CheckCustomPolicy(_ string, _ string) *CustomPolicyResult {
	return &CustomPolicyResult{
		Checked:    false,
		Confidence: 0,
		Detail:     "Custom policy guard requires LLM judge — not checked in programmatic mode",
	}
}
