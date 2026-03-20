package service

import (
	"regexp"
	"strings"
)

// InjectionFinding describes a detected prompt injection attempt.
type InjectionFinding struct {
	Pattern    string `json:"pattern"`
	Matched    string `json:"matched"`
	Confidence float64 `json:"confidence"`
}

// Compiled prompt injection regex patterns.
var injectionPatterns = []struct {
	Name    string
	Pattern *regexp.Regexp
}{
	// Direct instruction override
	{"ignore_previous", regexp.MustCompile(`(?i)ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|directives?|rules?|guidelines?)`)},
	{"disregard_previous", regexp.MustCompile(`(?i)disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|directives?|rules?|guidelines?)`)},
	{"forget_previous", regexp.MustCompile(`(?i)forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|directives?|rules?|guidelines?)`)},
	{"override_previous", regexp.MustCompile(`(?i)override\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|directives?|rules?|guidelines?)`)},

	// System prompt extraction
	{"reveal_prompt", regexp.MustCompile(`(?i)(reveal|show|display|print|output|repeat|echo)\s+(your|the)\s+(system\s+)?(prompt|instructions?|directives?|rules?|guidelines?)`)},
	{"what_is_prompt", regexp.MustCompile(`(?i)what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|directives?|rules?)`)},
	{"system_prompt_colon", regexp.MustCompile(`(?i)system\s*prompt\s*:`)},

	// Role play attacks
	{"you_are_now", regexp.MustCompile(`(?i)you\s+are\s+now\s+(a|an|the)\s+`)},
	{"pretend_to_be", regexp.MustCompile(`(?i)pretend\s+(you\s+are|to\s+be|you're)\s+`)},
	{"act_as", regexp.MustCompile(`(?i)act\s+as\s+(a|an|if\s+you\s+are|if\s+you're)\s+`)},
	{"simulate_being", regexp.MustCompile(`(?i)simulate\s+(being|a|an)\s+`)},

	// Instruction injection in data
	{"inst_tag", regexp.MustCompile(`(?i)\[INST\]`)},
	{"im_start_system", regexp.MustCompile(`(?i)<\|im_start\|>system`)},
	{"hash_instruction", regexp.MustCompile(`(?i)###\s*(system|instruction|assistant)\s*:`)},
	{"system_tag", regexp.MustCompile(`(?i)<system>`)},

	// Jailbreak attempts
	{"dan_mode", regexp.MustCompile(`(?i)(DAN|do\s+anything\s+now)\s+(mode|prompt|jailbreak)`)},
	{"jailbreak", regexp.MustCompile(`(?i)jailbreak`)},
	{"bypass_safety", regexp.MustCompile(`(?i)bypass\s+(your\s+)?(safety|content|filter|restriction|guardrail)`)},

	// Encoding/obfuscation attacks
	{"base64_decode", regexp.MustCompile(`(?i)base64\s*decode`)},
	{"rot13", regexp.MustCompile(`(?i)rot13`)},
	{"translate_encoding", regexp.MustCompile(`(?i)translate\s+from\s+(base64|hex|binary|morse)`)},

	// Multi-turn extraction
	{"extract_prompt_chars", regexp.MustCompile(`(?i)(first|start)\s+(word|letter|character)\s+of\s+(your|the)\s+(system\s+)?(prompt|instructions?)`)},
}

// DetectInjection checks text for known prompt injection patterns.
// Returns a list of findings. Empty list means no injection detected.
func DetectInjection(text string) []InjectionFinding {
	var findings []InjectionFinding

	for _, ip := range injectionPatterns {
		loc := ip.Pattern.FindStringIndex(text)
		if loc != nil {
			matched := text[loc[0]:loc[1]]
			// Truncate matched text for safety
			if len(matched) > 200 {
				matched = matched[:200]
			}
			findings = append(findings, InjectionFinding{
				Pattern:    ip.Name,
				Matched:    matched,
				Confidence: 1.0, // Pattern-based is always confident
			})
		}
	}

	return findings
}

// ContainsInjection is a convenience function that returns true if any injection pattern is found.
func ContainsInjection(text string) bool {
	for _, ip := range injectionPatterns {
		if ip.Pattern.MatchString(text) {
			return true
		}
	}
	return false
}

// DescribeInjection returns a human-readable summary of injection findings.
func DescribeInjection(findings []InjectionFinding) string {
	if len(findings) == 0 {
		return ""
	}
	names := make([]string, len(findings))
	for i, f := range findings {
		names[i] = f.Pattern
	}
	return "Prompt injection patterns detected: " + strings.Join(names, ", ")
}
