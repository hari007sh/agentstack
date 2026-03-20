package service

// TopicResult holds the result of a topic guard check.
type TopicResult struct {
	Checked    bool    `json:"checked"`
	Confidence float64 `json:"confidence"`
	Detail     string  `json:"detail"`
}

// CheckTopic is a stub — real topic detection requires an LLM
// to classify the content against allowed/blocked topics. Returns not_checked.
func CheckTopic(_ string, _ []string, _ []string) *TopicResult {
	return &TopicResult{
		Checked:    false,
		Confidence: 0,
		Detail:     "Topic guard requires LLM judge — not checked in programmatic mode",
	}
}
