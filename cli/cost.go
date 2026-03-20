package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// CostCommand handles all "agentstack cost" subcommands.
func CostCommand(args []string) {
	if len(args) == 0 {
		fmt.Println("Usage: agentstack cost <command>")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  summary   Show cost summary")
		fmt.Println("  budgets   List budget policies with utilization")
		os.Exit(0)
	}

	switch args[0] {
	case "summary":
		costSummary()
	case "budgets":
		costBudgets()
	default:
		fmt.Fprintf(os.Stderr, "Unknown cost command: %s\n", args[0])
		os.Exit(1)
	}
}

func costSummary() {
	apiURL := getAPIURL()
	apiKey := getAPIKey()

	url := fmt.Sprintf("%s/v1/cost/analytics/summary", apiURL)
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

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing response: %v\n", err)
		os.Exit(1)
	}

	if summary, ok := result["summary"].(map[string]interface{}); ok {
		totalCents, _ := summary["total_spend_cents"].(float64)
		totalEvents, _ := summary["total_events"].(float64)
		uniqueModels, _ := summary["unique_models"].(float64)
		uniqueAgents, _ := summary["unique_agents"].(float64)
		avgPerSession, _ := summary["avg_cost_per_session_cents"].(float64)

		fmt.Printf("Cost Summary\n")
		fmt.Printf("  Total Spend:         $%.2f\n", totalCents/100)
		fmt.Printf("  Total Events:        %.0f\n", totalEvents)
		fmt.Printf("  Avg Cost/Session:    $%.2f\n", avgPerSession/100)
		fmt.Printf("  Unique Models:       %.0f\n", uniqueModels)
		fmt.Printf("  Unique Agents:       %.0f\n", uniqueAgents)
	} else {
		fmt.Printf("Response: %s\n", string(body))
	}
}

func costBudgets() {
	apiURL := getAPIURL()
	apiKey := getAPIKey()

	url := fmt.Sprintf("%s/v1/cost/budgets", apiURL)
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

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing response: %v\n", err)
		os.Exit(1)
	}

	budgets, ok := result["budgets"].([]interface{})
	if !ok || len(budgets) == 0 {
		fmt.Println("No budget policies found.")
		return
	}

	fmt.Printf("Budget Policies\n")
	fmt.Printf("%-36s %-20s %-10s %-12s %-12s %s\n", "ID", "Name", "Scope", "Limit", "Spent", "Utilization")
	fmt.Println(repeatChar('-', 110))

	for _, b := range budgets {
		budget, ok := b.(map[string]interface{})
		if !ok {
			continue
		}

		id, _ := budget["id"].(string)
		name, _ := budget["name"].(string)
		scope, _ := budget["scope"].(string)
		limitCents, _ := budget["limit_cents"].(float64)
		spendCents, _ := budget["current_spend_cents"].(float64)

		utilization := 0.0
		if limitCents > 0 {
			utilization = (spendCents / limitCents) * 100
		}

		fmt.Printf("%-36s %-20s %-10s $%-11.2f $%-11.2f %.1f%%\n",
			id, truncate(name, 20), scope,
			limitCents/100, spendCents/100, utilization)
	}
}

func repeatChar(ch byte, n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = ch
	}
	return string(b)
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
