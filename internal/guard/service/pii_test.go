package service

import (
	"testing"
)

func TestDetectPII_Email(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected int // number of matches
	}{
		{"simple email", "Contact me at user@example.com", 1},
		{"multiple emails", "Send to alice@test.com and bob@company.org", 2},
		{"email with dots", "reach.me.here@sub.domain.co.uk", 1},
		{"email with plus", "user+tag@gmail.com", 1},
		{"no email", "This text has no emails", 0},
		{"email-like but invalid", "user@", 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			matches := DetectPII(tc.text, []string{"email"})
			if len(matches) != tc.expected {
				t.Errorf("DetectPII(%q, email) got %d matches, want %d", tc.text, len(matches), tc.expected)
				for _, m := range matches {
					t.Logf("  matched: %q at [%d:%d]", m.Value, m.Start, m.End)
				}
			}
			for _, m := range matches {
				if m.Type != "email" {
					t.Errorf("match type = %q, want %q", m.Type, "email")
				}
			}
		})
	}
}

func TestDetectPII_Phone(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected int
	}{
		{"US phone with dashes", "Call 555-123-4567", 1},
		{"US phone with parens", "Call (555) 123-4567", 1},
		{"US phone with dots", "Call 555.123.4567", 1},
		{"US phone with country code", "Call +1-555-123-4567", 1},
		{"no phone", "No phone here", 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			matches := DetectPII(tc.text, []string{"phone"})
			if len(matches) != tc.expected {
				t.Errorf("DetectPII(%q, phone) got %d matches, want %d", tc.text, len(matches), tc.expected)
			}
		})
	}
}

func TestDetectPII_SSN(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected int
	}{
		{"valid SSN", "SSN: 123-45-6789", 1},
		{"SSN in context", "My social is 999-88-7777 please", 1},
		{"no SSN", "Just a number 12345", 0},
		{"wrong format", "123-456-789 is not SSN format", 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			matches := DetectPII(tc.text, []string{"ssn"})
			if len(matches) != tc.expected {
				t.Errorf("DetectPII(%q, ssn) got %d matches, want %d", tc.text, len(matches), tc.expected)
			}
		})
	}
}

func TestDetectPII_CreditCard(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected int
	}{
		{"card with spaces", "Card: 4111 1111 1111 1111", 1},
		{"card with dashes", "Card: 4111-1111-1111-1111", 1},
		{"card without separators", "Card: 4111111111111111", 1},
		{"no card", "Random text here", 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			matches := DetectPII(tc.text, []string{"credit_card"})
			if len(matches) != tc.expected {
				t.Errorf("DetectPII(%q, credit_card) got %d matches, want %d", tc.text, len(matches), tc.expected)
			}
		})
	}
}

func TestDetectPII_IPAddress(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected int
	}{
		{"valid IP", "Server at 192.168.1.1", 1},
		{"localhost", "Listening on 127.0.0.1", 1},
		{"multiple IPs", "From 10.0.0.1 to 10.0.0.2", 2},
		{"invalid octets", "Not an IP: 999.999.999.999", 0},
		{"no IP", "No IPs here", 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			matches := DetectPII(tc.text, []string{"ip_address"})
			if len(matches) != tc.expected {
				t.Errorf("DetectPII(%q, ip_address) got %d matches, want %d", tc.text, len(matches), tc.expected)
			}
		})
	}
}

func TestDetectPII_DateOfBirth(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected int
	}{
		{"valid DOB", "Born on 01/15/1990", 1},
		{"DOB with dashes", "DOB: 12-25-2000", 1},
		{"invalid month", "Date: 13/01/1990", 0},
		{"no date", "No dates here", 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			matches := DetectPII(tc.text, []string{"date_of_birth"})
			if len(matches) != tc.expected {
				t.Errorf("DetectPII(%q, date_of_birth) got %d matches, want %d", tc.text, len(matches), tc.expected)
			}
		})
	}
}

func TestDetectPII_MultipleTypes(t *testing.T) {
	text := "Contact alice@example.com or call 555-123-4567. SSN: 123-45-6789"
	matches := DetectPII(text, AllPIITypes)

	if len(matches) < 3 {
		t.Errorf("expected at least 3 PII matches, got %d", len(matches))
	}

	types := make(map[string]bool)
	for _, m := range matches {
		types[m.Type] = true
	}

	for _, expected := range []string{"email", "phone", "ssn"} {
		if !types[expected] {
			t.Errorf("expected to find PII type %q, but didn't", expected)
		}
	}
}

func TestDetectPII_UnknownType(t *testing.T) {
	matches := DetectPII("some text", []string{"nonexistent_type"})
	if len(matches) != 0 {
		t.Errorf("unknown PII type should return 0 matches, got %d", len(matches))
	}
}

func TestDetectPII_EmptyText(t *testing.T) {
	matches := DetectPII("", AllPIITypes)
	if len(matches) != 0 {
		t.Errorf("empty text should return 0 matches, got %d", len(matches))
	}
}

func TestDetectPII_MatchPositions(t *testing.T) {
	text := "Email: test@example.com"
	matches := DetectPII(text, []string{"email"})

	if len(matches) != 1 {
		t.Fatalf("expected 1 match, got %d", len(matches))
	}

	m := matches[0]
	extracted := text[m.Start:m.End]
	if extracted != "test@example.com" {
		t.Errorf("position extraction got %q, want %q", extracted, "test@example.com")
	}
}

func TestRedactPII(t *testing.T) {
	t.Run("redacts single match", func(t *testing.T) {
		text := "Email: user@test.com"
		matches := DetectPII(text, []string{"email"})
		result := RedactPII(text, matches)

		expected := "Email: [REDACTED_EMAIL]"
		if result != expected {
			t.Errorf("RedactPII() = %q, want %q", result, expected)
		}
	})

	t.Run("redacts multiple matches of same type", func(t *testing.T) {
		text := "From a@b.com to c@d.com"
		matches := DetectPII(text, []string{"email"})
		result := RedactPII(text, matches)

		if result == text {
			t.Error("RedactPII() did not change the text")
		}
		// Both should be redacted
		if len(DetectPII(result, []string{"email"})) != 0 {
			t.Error("redacted text still contains email PII")
		}
	})

	t.Run("redacts multiple types", func(t *testing.T) {
		text := "Email: alice@test.com SSN: 123-45-6789"
		matches := DetectPII(text, AllPIITypes)
		result := RedactPII(text, matches)

		if len(DetectPII(result, AllPIITypes)) != 0 {
			t.Error("redacted text still contains PII")
		}
	})

	t.Run("no matches returns original text", func(t *testing.T) {
		text := "Nothing sensitive here"
		result := RedactPII(text, nil)
		if result != text {
			t.Errorf("RedactPII with no matches changed text: %q", result)
		}
	})

	t.Run("empty matches returns original text", func(t *testing.T) {
		text := "Nothing sensitive"
		result := RedactPII(text, []PIIMatch{})
		if result != text {
			t.Errorf("RedactPII with empty matches changed text: %q", result)
		}
	})
}
