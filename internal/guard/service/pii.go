// Package service provides guard check implementations for the Guard module.
package service

import (
	"regexp"
	"sort"
)

// PIIMatch represents a detected PII item with its type and position.
type PIIMatch struct {
	Type  string `json:"type"`
	Value string `json:"value"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}

// Compiled PII regex patterns — compiled once at package init for speed.
var piiPatterns = map[string]*regexp.Regexp{
	"email": regexp.MustCompile(
		`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`,
	),
	"phone": regexp.MustCompile(
		`(?:(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4})`,
	),
	"ssn": regexp.MustCompile(
		`\b\d{3}-\d{2}-\d{4}\b`,
	),
	"credit_card": regexp.MustCompile(
		`\b(?:\d{4}[-\s]?){3}\d{4}\b`,
	),
	"ip_address": regexp.MustCompile(
		`\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b`,
	),
	"date_of_birth": regexp.MustCompile(
		`\b(?:0[1-9]|1[0-2])[/\-](?:0[1-9]|[12]\d|3[01])[/\-](?:19|20)\d{2}\b`,
	),
}

// Redaction tokens per PII type.
var redactionTokens = map[string]string{
	"email":         "[REDACTED_EMAIL]",
	"phone":         "[REDACTED_PHONE]",
	"ssn":           "[REDACTED_SSN]",
	"credit_card":   "[REDACTED_CREDIT_CARD]",
	"ip_address":    "[REDACTED_IP]",
	"date_of_birth": "[REDACTED_DOB]",
}

// AllPIITypes lists every PII type the detector supports.
var AllPIITypes = []string{"email", "phone", "ssn", "credit_card", "ip_address", "date_of_birth"}

// DetectPII finds all PII matches in the text for the specified types.
// This is entirely regex-based — no LLM calls — and runs in <1ms for typical inputs.
func DetectPII(text string, types []string) []PIIMatch {
	var matches []PIIMatch

	for _, piiType := range types {
		pattern, ok := piiPatterns[piiType]
		if !ok {
			continue
		}

		locs := pattern.FindAllStringIndex(text, -1)
		for _, loc := range locs {
			matches = append(matches, PIIMatch{
				Type:  piiType,
				Value: text[loc[0]:loc[1]],
				Start: loc[0],
				End:   loc[1],
			})
		}
	}

	return matches
}

// RedactPII replaces PII matches with redaction tokens.
// Processes matches in reverse order to preserve string positions.
func RedactPII(text string, matches []PIIMatch) string {
	if len(matches) == 0 {
		return text
	}

	// Sort matches by Start descending so we can replace from end to start.
	sorted := make([]PIIMatch, len(matches))
	copy(sorted, matches)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Start > sorted[j].Start
	})

	result := text
	for _, m := range sorted {
		token := redactionTokens[m.Type]
		if token == "" {
			token = "[REDACTED]"
		}
		result = result[:m.Start] + token + result[m.End:]
	}

	return result
}
