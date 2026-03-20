package provider

// TogetherAdapter implements Provider for the Together AI API.
// Together uses an OpenAI-compatible API, so this wraps the OpenAI adapter.
type TogetherAdapter struct {
	*OpenAIAdapter
}

// NewTogetherAdapter creates a new Together AI adapter.
func NewTogetherAdapter(cfg AdapterConfig) *TogetherAdapter {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.together.xyz"
	}
	return &TogetherAdapter{
		OpenAIAdapter: NewOpenAIAdapter(cfg),
	}
}

func (a *TogetherAdapter) Name() string { return "together" }
