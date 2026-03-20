package service

import (
	"regexp"
	"strings"
)

// CodeExecFinding describes a detected code execution pattern.
type CodeExecFinding struct {
	Pattern    string  `json:"pattern"`
	Matched    string  `json:"matched"`
	Confidence float64 `json:"confidence"`
}

// Default dangerous code execution patterns.
var defaultCodeExecPatterns = []struct {
	Name    string
	Pattern *regexp.Regexp
}{
	// Python
	{"eval", regexp.MustCompile(`(?i)\beval\s*\(`)},
	{"exec", regexp.MustCompile(`(?i)\bexec\s*\(`)},
	{"os_system", regexp.MustCompile(`(?i)\bos\s*\.\s*system\s*\(`)},
	{"subprocess", regexp.MustCompile(`(?i)\bsubprocess\s*\.\s*(call|run|Popen|check_output)\s*\(`)},
	{"import_os", regexp.MustCompile(`(?i)\bimport\s+os\b`)},
	{"import_subprocess", regexp.MustCompile(`(?i)\bimport\s+subprocess\b`)},
	{"__import__", regexp.MustCompile(`(?i)\b__import__\s*\(`)},
	{"compile", regexp.MustCompile(`(?i)\bcompile\s*\(`)},

	// Shell
	{"rm_rf", regexp.MustCompile(`(?i)\brm\s+-rf\b`)},
	{"curl_pipe_sh", regexp.MustCompile(`(?i)curl\s+.*\|\s*(sh|bash|zsh)`)},
	{"wget_pipe_sh", regexp.MustCompile(`(?i)wget\s+.*\|\s*(sh|bash|zsh)`)},
	{"chmod_777", regexp.MustCompile(`(?i)\bchmod\s+777\b`)},
	{"sudo_rm", regexp.MustCompile(`(?i)\bsudo\s+rm\b`)},

	// SQL injection
	{"drop_table", regexp.MustCompile(`(?i)\bDROP\s+TABLE\b`)},
	{"drop_database", regexp.MustCompile(`(?i)\bDROP\s+DATABASE\b`)},
	{"delete_from", regexp.MustCompile(`(?i)\bDELETE\s+FROM\b`)},
	{"truncate_table", regexp.MustCompile(`(?i)\bTRUNCATE\s+TABLE\b`)},

	// JavaScript/Node
	{"child_process", regexp.MustCompile(`(?i)\brequire\s*\(\s*['"]child_process['"]\s*\)`)},
	{"process_exit", regexp.MustCompile(`(?i)\bprocess\s*\.\s*exit\s*\(`)},
	{"fs_unlink", regexp.MustCompile(`(?i)\bfs\s*\.\s*(unlink|rmdir|rm)\s*\(`)},
}

// DetectCodeExec checks text for dangerous code execution patterns.
// Uses configurable block patterns or falls back to defaults.
func DetectCodeExec(text string, customPatterns []string) []CodeExecFinding {
	var findings []CodeExecFinding

	if len(customPatterns) > 0 {
		// Use custom patterns from guardrail config
		for _, pat := range customPatterns {
			if strings.Contains(strings.ToLower(text), strings.ToLower(pat)) {
				// Find the actual match location for context
				idx := strings.Index(strings.ToLower(text), strings.ToLower(pat))
				end := idx + len(pat)
				if end > len(text) {
					end = len(text)
				}
				findings = append(findings, CodeExecFinding{
					Pattern:    pat,
					Matched:    text[idx:end],
					Confidence: 1.0,
				})
			}
		}
	} else {
		// Use default compiled patterns
		for _, cp := range defaultCodeExecPatterns {
			loc := cp.Pattern.FindStringIndex(text)
			if loc != nil {
				matched := text[loc[0]:loc[1]]
				if len(matched) > 200 {
					matched = matched[:200]
				}
				findings = append(findings, CodeExecFinding{
					Pattern:    cp.Name,
					Matched:    matched,
					Confidence: 1.0,
				})
			}
		}
	}

	return findings
}

// DescribeCodeExec returns a human-readable summary of code execution findings.
func DescribeCodeExec(findings []CodeExecFinding) string {
	if len(findings) == 0 {
		return ""
	}
	names := make([]string, len(findings))
	for i, f := range findings {
		names[i] = f.Pattern
	}
	return "Dangerous code patterns detected: " + strings.Join(names, ", ")
}
