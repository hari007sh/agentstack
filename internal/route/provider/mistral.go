package provider

// MistralAdapter implements Provider for the Mistral AI API.
// Mistral uses an OpenAI-compatible API, so this wraps the OpenAI adapter.
type MistralAdapter struct {
	*OpenAIAdapter
}

// NewMistralAdapter creates a new Mistral AI adapter.
func NewMistralAdapter(cfg AdapterConfig) *MistralAdapter {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.mistral.ai"
	}
	return &MistralAdapter{
		OpenAIAdapter: NewMistralOpenAIAdapter(cfg),
	}
}

func (a *MistralAdapter) Name() string { return "mistral" }

// NewMistralOpenAIAdapter creates an OpenAI adapter configured for Mistral.
func NewMistralOpenAIAdapter(cfg AdapterConfig) *OpenAIAdapter {
	return NewOpenAIAdapter(cfg)
}
