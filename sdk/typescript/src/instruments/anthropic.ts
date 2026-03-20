import { SpanType } from '../types';
import { SpanInstance } from '../span';
import { getGlobalClient, getGlobalSession } from '../index';

/**
 * Auto-instrumentation for the Anthropic Node.js SDK.
 *
 * Wraps the Anthropic client to automatically create spans for each API call,
 * capturing model, token usage, input/output, and errors.
 *
 * @example
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * import { instrumentAnthropic } from '@agentstack/sdk';
 *
 * const anthropic = instrumentAnthropic(new Anthropic({ apiKey: '...' }));
 * // All calls now automatically create spans
 * const response = await anthropic.messages.create({ model: 'claude-3-sonnet', ... });
 * ```
 */

interface AnthropicLike {
  messages?: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
  completions?: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
}

interface MessageResponse {
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  stop_reason?: string;
}

interface CompletionResponse {
  model?: string;
  completion?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export function instrumentAnthropic<T extends AnthropicLike>(client: T): T {
  const wrapped = Object.create(client) as T;

  // Wrap messages.create
  if (client.messages) {
    const originalCreate = client.messages.create.bind(client.messages);

    (wrapped as AnthropicLike).messages = {
      create: async (...args: unknown[]): Promise<unknown> => {
        const agentClient = getGlobalClient();
        const session = getGlobalSession();

        if (!agentClient || !session) {
          return originalCreate(...args);
        }

        const params = (args[0] ?? {}) as Record<string, unknown>;
        const span = session.createSpan(
          'anthropic.messages.create',
          SpanType.LLM,
        );

        span.setInput(params);

        if (typeof params.model === 'string') {
          span.setModel(params.model);
        }

        try {
          const response = (await originalCreate(...args)) as MessageResponse;

          if (response.model) {
            span.setModel(response.model);
          }

          if (response.usage) {
            span.setTokens(
              response.usage.input_tokens ?? 0,
              response.usage.output_tokens ?? 0,
            );
          }

          span.setOutput(response);
          span.end();
          return response;
        } catch (err) {
          span.setError(err instanceof Error ? err : new Error(String(err)));
          span.end();
          throw err;
        }
      },
    };
  }

  // Wrap completions.create (legacy API)
  if (client.completions) {
    const originalCompletionsCreate = client.completions.create.bind(client.completions);

    (wrapped as AnthropicLike).completions = {
      create: async (...args: unknown[]): Promise<unknown> => {
        const agentClient = getGlobalClient();
        const session = getGlobalSession();

        if (!agentClient || !session) {
          return originalCompletionsCreate(...args);
        }

        const params = (args[0] ?? {}) as Record<string, unknown>;
        const span = session.createSpan(
          'anthropic.completions.create',
          SpanType.LLM,
        );

        span.setInput(params);

        if (typeof params.model === 'string') {
          span.setModel(params.model);
        }

        try {
          const response = (await originalCompletionsCreate(...args)) as CompletionResponse;

          if (response.model) {
            span.setModel(response.model);
          }

          if (response.usage) {
            span.setTokens(
              response.usage.input_tokens ?? 0,
              response.usage.output_tokens ?? 0,
            );
          }

          span.setOutput(response);
          span.end();
          return response;
        } catch (err) {
          span.setError(err instanceof Error ? err : new Error(String(err)));
          span.end();
          throw err;
        }
      },
    };
  }

  return wrapped;
}
