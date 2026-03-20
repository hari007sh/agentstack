/**
 * Cost tracking module — stub for cost estimation and budget management.
 *
 * Future implementation will include:
 * - Per-model pricing tables
 * - Token-based cost calculation
 * - Budget alerts and limits
 * - Cost aggregation by session, project, time period
 */

export interface ModelPricing {
  model: string;
  promptPricePerToken: number;
  completionPricePerToken: number;
}

export interface CostEstimate {
  promptCost: number;
  completionCost: number;
  totalCost: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

// Default pricing table — stub with common models
const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4': {
    model: 'gpt-4',
    promptPricePerToken: 0.00003,
    completionPricePerToken: 0.00006,
  },
  'gpt-4-turbo': {
    model: 'gpt-4-turbo',
    promptPricePerToken: 0.00001,
    completionPricePerToken: 0.00003,
  },
  'gpt-3.5-turbo': {
    model: 'gpt-3.5-turbo',
    promptPricePerToken: 0.0000005,
    completionPricePerToken: 0.0000015,
  },
  'claude-3-opus': {
    model: 'claude-3-opus',
    promptPricePerToken: 0.000015,
    completionPricePerToken: 0.000075,
  },
  'claude-3-sonnet': {
    model: 'claude-3-sonnet',
    promptPricePerToken: 0.000003,
    completionPricePerToken: 0.000015,
  },
};

/**
 * Estimate the cost of a completion given token counts and model.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): CostEstimate {
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    return {
      promptCost: 0,
      completionCost: 0,
      totalCost: 0,
      model,
      promptTokens,
      completionTokens,
    };
  }

  const promptCost = promptTokens * pricing.promptPricePerToken;
  const completionCost = completionTokens * pricing.completionPricePerToken;

  return {
    promptCost,
    completionCost,
    totalCost: promptCost + completionCost,
    model,
    promptTokens,
    completionTokens,
  };
}

/**
 * Register a custom model pricing entry.
 */
export function registerModelPricing(pricing: ModelPricing): void {
  MODEL_PRICING[pricing.model] = pricing;
}

/**
 * Get all registered model pricings.
 */
export function getModelPricings(): Record<string, ModelPricing> {
  return { ...MODEL_PRICING };
}
