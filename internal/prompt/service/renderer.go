package service

import (
	"encoding/json"
	"fmt"
	"regexp"
)

// variablePattern matches {{variable_name}} placeholders in prompt templates.
var variablePattern = regexp.MustCompile(`\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}`)

// VariableDefinition describes a single template variable.
type VariableDefinition struct {
	Name     string      `json:"name"`
	Type     string      `json:"type"`
	Required bool        `json:"required"`
	Default  interface{} `json:"default"`
}

// VariableSchema wraps the list of variable definitions as stored in the DB.
type VariableSchema struct {
	Variables []VariableDefinition `json:"variables"`
}

// Renderer interpolates {{variable}} placeholders in prompt templates.
type Renderer struct{}

// NewRenderer creates a new Renderer.
func NewRenderer() *Renderer {
	return &Renderer{}
}

// Render replaces {{variable}} placeholders with values from the variables map.
// It validates required variables against the schema and applies defaults.
func (r *Renderer) Render(template string, variables map[string]interface{}, schemaJSON json.RawMessage) (string, error) {
	// Parse the schema
	var schema VariableSchema
	if len(schemaJSON) > 0 && string(schemaJSON) != "{}" {
		if err := json.Unmarshal(schemaJSON, &schema); err != nil {
			// If schema parsing fails, just do simple replacement
			schema = VariableSchema{}
		}
	}

	// Build a merged values map: start with defaults, then apply provided values
	merged := make(map[string]interface{})
	for _, def := range schema.Variables {
		if def.Default != nil && def.Default != "" {
			merged[def.Name] = def.Default
		}
	}
	for k, v := range variables {
		merged[k] = v
	}

	// Validate required variables
	for _, def := range schema.Variables {
		if def.Required {
			val, exists := merged[def.Name]
			if !exists || val == nil || fmt.Sprintf("%v", val) == "" {
				return "", fmt.Errorf("required variable %q is missing", def.Name)
			}
		}
	}

	// Perform replacement
	result := variablePattern.ReplaceAllStringFunc(template, func(match string) string {
		// Extract variable name from {{name}}
		name := match[2 : len(match)-2]
		if val, ok := merged[name]; ok {
			return fmt.Sprintf("%v", val)
		}
		// Leave unknown placeholders as-is
		return match
	})

	return result, nil
}

// ExtractVariables returns all {{variable}} names found in a template string.
func (r *Renderer) ExtractVariables(template string) []string {
	matches := variablePattern.FindAllStringSubmatch(template, -1)
	seen := make(map[string]bool)
	var vars []string
	for _, m := range matches {
		name := m[1]
		if !seen[name] {
			seen[name] = true
			vars = append(vars, name)
		}
	}
	return vars
}

// RenderSimple performs basic variable substitution without schema validation.
func (r *Renderer) RenderSimple(template string, variables map[string]interface{}) string {
	result := variablePattern.ReplaceAllStringFunc(template, func(match string) string {
		name := match[2 : len(match)-2]
		if val, ok := variables[name]; ok {
			return fmt.Sprintf("%v", val)
		}
		return match
	})
	return result
}

