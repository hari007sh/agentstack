package service

import (
	"regexp"
	"strings"
)

// ToxicityFinding describes a toxicity detection result.
type ToxicityFinding struct {
	Category   string  `json:"category"`
	Matched    string  `json:"matched"`
	Confidence float64 `json:"confidence"`
}

// toxicityPatterns maps categories to compiled regex patterns for keyword-based detection.
// This is a fast, pattern-based approach. LLM-judge is a future enhancement.
var toxicityPatterns = map[string][]*regexp.Regexp{
	"hate": {
		regexp.MustCompile(`(?i)\b(nigger|nigga|kike|spic|chink|wetback|gook|raghead|towelhead|fag|faggot|dyke|tranny|retard)\b`),
		regexp.MustCompile(`(?i)\b(kill\s+all|death\s+to|exterminate)\s+(jews|blacks|whites|muslims|christians|gays|immigrants|women|men)\b`),
	},
	"harassment": {
		regexp.MustCompile(`(?i)\b(i\s+will|i'll|gonna|going\s+to)\s+(kill|murder|hurt|harm|rape|assault|attack|stalk)\s+(you|your|him|her|them)\b`),
		regexp.MustCompile(`(?i)\b(you\s+should|you\s+deserve\s+to)\s+(die|be\s+killed|suffer|be\s+hurt)\b`),
		regexp.MustCompile(`(?i)\b(dox|doxx|doxing|doxxing|swat|swatting)\b`),
	},
	"self_harm": {
		regexp.MustCompile(`(?i)\b(how\s+to|ways\s+to|methods?\s+(of|for|to))\s+(kill\s+(myself|yourself)|commit\s+suicide|self[\s-]?harm|cut\s+(myself|yourself))\b`),
		regexp.MustCompile(`(?i)\b(encourage|promote|glorify)\s+(suicide|self[\s-]?harm|cutting)\b`),
	},
	"violence": {
		regexp.MustCompile(`(?i)\b(how\s+to|instructions?\s+for|guide\s+to)\s+(make|build|create)\s+(a\s+)?(bomb|explosive|weapon|gun|poison)\b`),
		regexp.MustCompile(`(?i)\b(how\s+to|ways\s+to|methods?\s+to)\s+(kill|murder|torture|assassinate)\s+(someone|a\s+person|people)\b`),
	},
}

// DetectToxicity checks text for toxic content using keyword/pattern matching.
// Returns findings grouped by category.
func DetectToxicity(text string, categories []string) []ToxicityFinding {
	var findings []ToxicityFinding

	if len(categories) == 0 {
		categories = []string{"hate", "harassment", "self_harm", "violence"}
	}

	for _, cat := range categories {
		patterns, ok := toxicityPatterns[cat]
		if !ok {
			continue
		}

		for _, p := range patterns {
			loc := p.FindStringIndex(text)
			if loc != nil {
				matched := text[loc[0]:loc[1]]
				if len(matched) > 200 {
					matched = matched[:200]
				}
				findings = append(findings, ToxicityFinding{
					Category:   cat,
					Matched:    matched,
					Confidence: 1.0,
				})
				break // One match per category is enough
			}
		}
	}

	return findings
}

// DescribeToxicity returns a human-readable summary of toxicity findings.
func DescribeToxicity(findings []ToxicityFinding) string {
	if len(findings) == 0 {
		return ""
	}
	cats := make([]string, len(findings))
	for i, f := range findings {
		cats[i] = f.Category
	}
	return "Toxic content detected in categories: " + strings.Join(cats, ", ")
}
