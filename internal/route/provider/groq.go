package provider

// GroqAdapter implements Provider for the Groq API.
// Groq uses an OpenAI-compatible API, so this wraps the OpenAI adapter.
type GroqAdapter struct {
	*OpenAIAdapter
}

// NewGroqAdapter creates a new Groq adapter.
func NewGroqAdapter(cfg AdapterConfig) *GroqAdapter {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.groq.com/openai"
	}
	return &GroqAdapter{
		OpenAIAdapter: NewOpenAIAdapter(cfg),
	}
}

func (a *GroqAdapter) Name() string { return "groq" }
