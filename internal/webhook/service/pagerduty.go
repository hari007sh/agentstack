package service

import "fmt"

// PagerDutyEvent represents a PagerDuty Events API v2 payload.
type PagerDutyEvent struct {
	RoutingKey  string           `json:"routing_key"`
	EventAction string           `json:"event_action"`
	DedupKey    string           `json:"dedup_key,omitempty"`
	Payload     PagerDutyPayload `json:"payload"`
}

// PagerDutyPayload is the payload section of a PagerDuty event.
type PagerDutyPayload struct {
	Summary       string                 `json:"summary"`
	Severity      string                 `json:"severity"`
	Source        string                 `json:"source"`
	Component     string                 `json:"component"`
	CustomDetails map[string]interface{} `json:"custom_details,omitempty"`
}

// FormatPagerDutyEvent converts a webhook event into a PagerDuty Events API v2 event.
func FormatPagerDutyEvent(event string, payload map[string]interface{}, routingKey string) PagerDutyEvent {
	severity := mapEventToSeverity(event)
	component := mapEventToComponent(event)
	summary := buildPDSummary(event, payload)
	dedupKey := buildDedupKey(event, payload)

	return PagerDutyEvent{
		RoutingKey:  routingKey,
		EventAction: mapEventToAction(event),
		DedupKey:    dedupKey,
		Payload: PagerDutyPayload{
			Summary:       summary,
			Severity:      severity,
			Source:        "agentstack",
			Component:     component,
			CustomDetails: payload,
		},
	}
}

// mapEventToSeverity maps AgentStack events to PagerDuty severity levels.
func mapEventToSeverity(event string) string {
	switch event {
	case "shield.circuit_break", "cost.budget_exceeded", "test.run_failed":
		return "critical"
	case "alert.fired", "guard.blocked", "session.failed":
		return "error"
	case "cost.budget_warning", "guard.flagged":
		return "warning"
	case "alert.resolved", "test.run_completed", "shield.healing":
		return "info"
	default:
		return "info"
	}
}

// mapEventToComponent maps events to component names.
func mapEventToComponent(event string) string {
	switch {
	case len(event) > 6 && event[:6] == "alert.":
		return "trace"
	case len(event) > 7 && event[:7] == "shield.":
		return "shield"
	case len(event) > 6 && event[:6] == "guard.":
		return "guard"
	case len(event) > 5 && event[:5] == "cost.":
		return "cost"
	case len(event) > 5 && event[:5] == "test.":
		return "test"
	case len(event) > 8 && event[:8] == "session.":
		return "trace"
	default:
		return "agentstack"
	}
}

// mapEventToAction maps events to PagerDuty event actions.
func mapEventToAction(event string) string {
	switch event {
	case "alert.resolved":
		return "resolve"
	default:
		return "trigger"
	}
}

// buildPDSummary creates a human-readable summary for PagerDuty.
func buildPDSummary(event string, payload map[string]interface{}) string {
	switch event {
	case "alert.fired":
		return fmt.Sprintf("Alert '%s' fired: %s = %v (threshold: %v)",
			getStr(payload, "alert_rule_name"),
			getStr(payload, "metric"),
			payload["current_value"],
			payload["threshold"])
	case "alert.resolved":
		return fmt.Sprintf("Alert '%s' resolved", getStr(payload, "alert_rule_name"))
	case "shield.healing":
		return fmt.Sprintf("Shield auto-healed: %s on agent %s",
			getStr(payload, "healer_type"),
			getStr(payload, "agent_name"))
	case "shield.circuit_break":
		return fmt.Sprintf("Shield circuit breaker activated for agent %s: %s",
			getStr(payload, "agent_name"),
			getStr(payload, "reason"))
	case "guard.blocked":
		return fmt.Sprintf("Guard '%s' blocked a request: %s",
			getStr(payload, "guard_name"),
			getStr(payload, "reason"))
	case "guard.flagged":
		return fmt.Sprintf("Guard '%s' flagged a request: %s",
			getStr(payload, "guard_name"),
			getStr(payload, "reason"))
	case "cost.budget_warning":
		return fmt.Sprintf("Budget '%s' at %v%% utilization",
			getStr(payload, "budget_name"),
			payload["utilization_pct"])
	case "cost.budget_exceeded":
		return fmt.Sprintf("Budget '%s' exceeded: %v / %v cents",
			getStr(payload, "budget_name"),
			payload["current_spend_cents"],
			payload["limit_cents"])
	case "test.run_completed":
		return fmt.Sprintf("Test run completed for suite '%s': score %v",
			getStr(payload, "suite_name"),
			payload["score"])
	case "test.run_failed":
		return fmt.Sprintf("Test run failed for suite '%s': %s",
			getStr(payload, "suite_name"),
			getStr(payload, "reason"))
	case "session.failed":
		return fmt.Sprintf("Session failed for agent '%s': %s",
			getStr(payload, "agent_name"),
			getStr(payload, "error"))
	default:
		return fmt.Sprintf("AgentStack event: %s", event)
	}
}

// buildDedupKey creates a dedup key for PagerDuty to group related events.
func buildDedupKey(event string, payload map[string]interface{}) string {
	switch event {
	case "alert.fired", "alert.resolved":
		return fmt.Sprintf("alert-%s", getStr(payload, "alert_rule_id"))
	case "cost.budget_warning", "cost.budget_exceeded":
		return fmt.Sprintf("budget-%s", getStr(payload, "budget_id"))
	default:
		return fmt.Sprintf("%s-%s", event, getStr(payload, "session_id"))
	}
}
