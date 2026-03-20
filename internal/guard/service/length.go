package service

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// LengthResult holds the result of a length guard check.
type LengthResult struct {
	Passed     bool   `json:"passed"`
	CharCount  int    `json:"char_count"`
	WordCount  int    `json:"word_count"`
	Violation  string `json:"violation,omitempty"`
}

// LengthConfig holds the min/max length configuration.
type LengthConfig struct {
	MinChars  *int `json:"min_chars,omitempty"`
	MaxChars  *int `json:"max_chars,omitempty"`
	MinTokens *int `json:"min_tokens,omitempty"`
	MaxTokens *int `json:"max_tokens,omitempty"`
}

// CheckLength verifies that the text meets the configured length constraints.
func CheckLength(text string, cfg LengthConfig) *LengthResult {
	charCount := utf8.RuneCountInString(text)
	wordCount := len(strings.Fields(text))

	// Approximate token count as words (rough heuristic: 1 token ~= 0.75 words for English).
	// This is a fast approximation; real tokenization would need a tokenizer library.
	approxTokens := int(float64(wordCount) / 0.75)

	result := &LengthResult{
		Passed:    true,
		CharCount: charCount,
		WordCount: wordCount,
	}

	if cfg.MinChars != nil && charCount < *cfg.MinChars {
		result.Passed = false
		result.Violation = fmt.Sprintf("text too short: %d chars (minimum %d)", charCount, *cfg.MinChars)
		return result
	}

	if cfg.MaxChars != nil && charCount > *cfg.MaxChars {
		result.Passed = false
		result.Violation = fmt.Sprintf("text too long: %d chars (maximum %d)", charCount, *cfg.MaxChars)
		return result
	}

	if cfg.MinTokens != nil && approxTokens < *cfg.MinTokens {
		result.Passed = false
		result.Violation = fmt.Sprintf("text too short: ~%d tokens (minimum %d)", approxTokens, *cfg.MinTokens)
		return result
	}

	if cfg.MaxTokens != nil && approxTokens > *cfg.MaxTokens {
		result.Passed = false
		result.Violation = fmt.Sprintf("text too long: ~%d tokens (maximum %d)", approxTokens, *cfg.MaxTokens)
		return result
	}

	return result
}
