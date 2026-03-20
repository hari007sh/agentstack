package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// TestCommand handles all "agentstack test" subcommands.
func TestCommand(args []string) {
	if len(args) == 0 {
		fmt.Println("Usage: agentstack test <command> [args]")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  run <suite-id>              Trigger a test run for a suite")
		fmt.Println("  status <run-id>             Check test run status")
		fmt.Println("  gate <run-id> --threshold N CI/CD quality gate")
		os.Exit(0)
	}

	switch args[0] {
	case "run":
		testRun(args[1:])
	case "status":
		testStatus(args[1:])
	case "gate":
		testGate(args[1:])
	default:
		fmt.Fprintf(os.Stderr, "Unknown test command: %s\n", args[0])
		os.Exit(1)
	}
}

func testRun(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "Usage: agentstack test run <suite-id>")
		os.Exit(1)
	}

	suiteID := args[0]
	apiURL := getAPIURL()
	apiKey := getAPIKey()

	url := fmt.Sprintf("%s/v1/test/suites/%s/run", apiURL, suiteID)
	req, err := http.NewRequest("POST", url, strings.NewReader("{}"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating request: %v\n", err)
		os.Exit(1)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error calling API: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		fmt.Fprintf(os.Stderr, "API error (%d): %s\n", resp.StatusCode, string(body))
		os.Exit(1)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing response: %v\n", err)
		os.Exit(1)
	}

	if run, ok := result["run"].(map[string]interface{}); ok {
		fmt.Printf("Test run started successfully\n")
		fmt.Printf("  Run ID:  %s\n", run["id"])
		fmt.Printf("  Status:  %s\n", run["status"])
		fmt.Printf("  Cases:   %.0f\n", run["total_cases"])
	} else {
		fmt.Printf("Response: %s\n", string(body))
	}
}

func testStatus(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "Usage: agentstack test status <run-id>")
		os.Exit(1)
	}

	runID := args[0]
	apiURL := getAPIURL()
	apiKey := getAPIKey()

	url := fmt.Sprintf("%s/v1/test/runs/%s", apiURL, runID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating request: %v\n", err)
		os.Exit(1)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error calling API: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		fmt.Fprintf(os.Stderr, "API error (%d): %s\n", resp.StatusCode, string(body))
		os.Exit(1)
	}

	var run map[string]interface{}
	if err := json.Unmarshal(body, &run); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing response: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Test Run: %s\n", runID)
	fmt.Printf("  Status:      %s\n", run["status"])
	fmt.Printf("  Total Cases: %.0f\n", run["total_cases"])
	fmt.Printf("  Passed:      %.0f\n", run["passed_cases"])
	fmt.Printf("  Failed:      %.0f\n", run["failed_cases"])
	fmt.Printf("  Errors:      %.0f\n", run["error_cases"])
	fmt.Printf("  Avg Score:   %.2f\n", run["avg_score"])
	fmt.Printf("  Duration:    %.0f ms\n", run["duration_ms"])
}

func testGate(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "Usage: agentstack test gate <run-id> [--threshold 0.8]")
		os.Exit(1)
	}

	runID := args[0]
	threshold := 0.8

	// Parse --threshold flag
	for i := 1; i < len(args); i++ {
		if args[i] == "--threshold" && i+1 < len(args) {
			fmt.Sscanf(args[i+1], "%f", &threshold)
			i++
		}
	}

	apiURL := getAPIURL()
	apiKey := getAPIKey()

	url := fmt.Sprintf("%s/v1/test/runs/%s", apiURL, runID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating request: %v\n", err)
		os.Exit(1)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error calling API: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		fmt.Fprintf(os.Stderr, "API error (%d): %s\n", resp.StatusCode, string(body))
		os.Exit(1)
	}

	var run map[string]interface{}
	if err := json.Unmarshal(body, &run); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing response: %v\n", err)
		os.Exit(1)
	}

	status, _ := run["status"].(string)
	avgScore, _ := run["avg_score"].(float64)

	fmt.Printf("Quality Gate Check\n")
	fmt.Printf("  Run ID:    %s\n", runID)
	fmt.Printf("  Status:    %s\n", status)
	fmt.Printf("  Avg Score: %.4f\n", avgScore)
	fmt.Printf("  Threshold: %.4f\n", threshold)

	if status != "completed" {
		fmt.Printf("\nGATE FAILED: run status is %q (expected \"completed\")\n", status)
		os.Exit(1)
	}

	if avgScore >= threshold {
		fmt.Printf("\nGATE PASSED: %.4f >= %.4f\n", avgScore, threshold)
		os.Exit(0)
	} else {
		fmt.Printf("\nGATE FAILED: %.4f < %.4f\n", avgScore, threshold)
		os.Exit(1)
	}
}

func getAPIURL() string {
	url := os.Getenv("AGENTSTACK_API_URL")
	if url == "" {
		url = "http://localhost:8080"
	}
	return url
}

func getAPIKey() string {
	key := os.Getenv("AGENTSTACK_API_KEY")
	if key == "" {
		fmt.Fprintln(os.Stderr, "Warning: AGENTSTACK_API_KEY not set, using empty key")
	}
	return key
}
