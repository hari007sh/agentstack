package service

import "fmt"

// SlackMessage represents a Slack Block Kit message.
type SlackMessage struct {
	Blocks []SlackBlock `json:"blocks"`
}

// SlackBlock represents a single block in a Slack message.
type SlackBlock struct {
	Type     string         `json:"type"`
	Text     *SlackText     `json:"text,omitempty"`
	Fields   []SlackText    `json:"fields,omitempty"`
	Elements []SlackElement `json:"elements,omitempty"`
}

// SlackText represents text in a Slack block.
type SlackText struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// SlackElement represents an interactive element in a Slack block.
type SlackElement struct {
	Type string    `json:"type"`
	Text SlackText `json:"text"`
	URL  string    `json:"url,omitempty"`
}

// FormatSlackMessage converts a webhook event into a Slack Block Kit message.
func FormatSlackMessage(event string, payload map[string]interface{}) SlackMessage {
	switch event {
	case "alert.fired":
		return formatAlertFired(payload)
	case "alert.resolved":
		return formatAlertResolved(payload)
	case "shield.healing":
		return formatShieldHealing(payload)
	case "shield.circuit_break":
		return formatShieldCircuitBreak(payload)
	case "guard.blocked":
		return formatGuardBlocked(payload)
	case "guard.flagged":
		return formatGuardFlagged(payload)
	case "cost.budget_warning":
		return formatBudgetWarning(payload)
	case "cost.budget_exceeded":
		return formatBudgetExceeded(payload)
	case "test.run_completed":
		return formatTestRunCompleted(payload)
	case "test.run_failed":
		return formatTestRunFailed(payload)
	case "session.failed":
		return formatSessionFailed(payload)
	default:
		return formatGenericEvent(event, payload)
	}
}

func formatAlertFired(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Alert Fired"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Alert:* %s", getStr(p, "alert_rule_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Metric:* %s", getStr(p, "metric"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Current:* %v", p["current_value"])},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Threshold:* %v", p["threshold"])},
				},
			},
		},
	}
}

func formatAlertResolved(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Alert Resolved"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Alert:* %s", getStr(p, "alert_rule_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Metric:* %s", getStr(p, "metric"))},
				},
			},
		},
	}
}

func formatShieldHealing(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Shield Auto-Healed a Failure"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Agent:* %s", getStr(p, "agent_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Session:* %s", getStr(p, "session_id"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Healer:* %s", getStr(p, "healer_type"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Action:* %s", getStr(p, "action"))},
				},
			},
		},
	}
}

func formatShieldCircuitBreak(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Shield Circuit Breaker Activated"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Agent:* %s", getStr(p, "agent_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Session:* %s", getStr(p, "session_id"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Reason:* %s", getStr(p, "reason"))},
				},
			},
		},
	}
}

func formatGuardBlocked(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Guard Blocked a Request"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Guard:* %s", getStr(p, "guard_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Type:* %s", getStr(p, "guard_type"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Reason:* %s", getStr(p, "reason"))},
				},
			},
		},
	}
}

func formatGuardFlagged(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Guard Flagged a Request"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Guard:* %s", getStr(p, "guard_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Type:* %s", getStr(p, "guard_type"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Reason:* %s", getStr(p, "reason"))},
				},
			},
		},
	}
}

func formatBudgetWarning(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Budget Warning"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Budget:* %s", getStr(p, "budget_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Utilization:* %v%%", p["utilization_pct"])},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Spend:* %v cents", p["current_spend_cents"])},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Limit:* %v cents", p["limit_cents"])},
				},
			},
		},
	}
}

func formatBudgetExceeded(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Budget Exceeded"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Budget:* %s", getStr(p, "budget_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Utilization:* %v%%", p["utilization_pct"])},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Spend:* %v cents", p["current_spend_cents"])},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Limit:* %v cents", p["limit_cents"])},
				},
			},
		},
	}
}

func formatTestRunCompleted(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Test Run Completed"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Suite:* %s", getStr(p, "suite_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Run:* %s", getStr(p, "run_id"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Status:* %s", getStr(p, "status"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Score:* %v", p["score"])},
				},
			},
		},
	}
}

func formatTestRunFailed(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Test Run Failed"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Suite:* %s", getStr(p, "suite_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Run:* %s", getStr(p, "run_id"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Failures:* %v", p["failures"])},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Reason:* %s", getStr(p, "reason"))},
				},
			},
		},
	}
}

func formatSessionFailed(p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: "Session Failed"},
			},
			{
				Type: "section",
				Fields: []SlackText{
					{Type: "mrkdwn", Text: fmt.Sprintf("*Agent:* %s", getStr(p, "agent_name"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Session:* %s", getStr(p, "session_id"))},
					{Type: "mrkdwn", Text: fmt.Sprintf("*Error:* %s", getStr(p, "error"))},
				},
			},
		},
	}
}

func formatGenericEvent(event string, p map[string]interface{}) SlackMessage {
	return SlackMessage{
		Blocks: []SlackBlock{
			{
				Type: "header",
				Text: &SlackText{Type: "plain_text", Text: fmt.Sprintf("AgentStack Event: %s", event)},
			},
			{
				Type: "section",
				Text: &SlackText{Type: "mrkdwn", Text: fmt.Sprintf("Event `%s` triggered.", event)},
			},
		},
	}
}

// getStr safely extracts a string from a map.
func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
		return fmt.Sprintf("%v", v)
	}
	return ""
}
