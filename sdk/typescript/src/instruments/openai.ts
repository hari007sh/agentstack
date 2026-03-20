import { SpanType } from '../types';
import { SpanInstance } from '../span';
import { getGlobalClient, getGlobalSession } from '../index';

/**
 * Auto-instrumentation for the OpenAI Node.js SDK.
 *
 * Wraps the OpenAI client to automatically create spans for each API call,
 * capturing model, token usage, input/output, and errors.
 *
 * @example
 * ```ts
 * import OpenAI from 'openai';
 * import { instrumentOpenAI } from '@agentstack/sdk';
 *
 * const openai = instrumentOpenAI(new OpenAI({ apiKey: '...' }));
 * // All calls now automatically create spans
 * const response = await openai.chat.completions.create({ model: 'gpt-4', messages: [...] });
 * ```
 */

interface OpenAILike {
  chat?: {
    completions: {
      create: (...args: unknown[]) => Promise<unknown>;
    };
  };
  completions?: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
  embeddings?: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
}

interface ChatCompletionResponse {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: { content?: string; role?: string };
  }>;
}

interface EmbeddingResponse {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

export function instrumentOpenAI<T extends OpenAILike>(client: T): T {
  const wrapped = Object.create(client) as T;

  // Wrap chat.completions.create
  if (client.chat?.completions) {
    const originalChatCreate = client.chat.completions.create.bind(client.chat.completions);

    (wrapped as OpenAILike).chat = {
      completions: {
        create: async (...args: unknown[]): Promise<unknown> => {
          const agentClient = getGlobalClient();
          const session = getGlobalSession();

          if (!agentClient || !session) {
            return originalChatCreate(...args);
          }

          const params = (args[0] ?? {}) as Record<string, unknown>;
          const span = session.createSpan(
            'openai.chat.completions.create',
            SpanType.LLM,
          );

          span.setInput(params);

          if (typeof params.model === 'string') {
            span.setModel(params.model);
          }

          try {
            const response = (await originalChatCreate(...args)) as ChatCompletionResponse;

            if (response.model) {
              span.setModel(response.model);
            }

            if (response.usage) {
              span.setTokens(
                response.usage.prompt_tokens ?? 0,
                response.usage.completion_tokens ?? 0,
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
      },
    };
  }

  // Wrap embeddings.create
  if (client.embeddings) {
    const originalEmbCreate = client.embeddings.create.bind(client.embeddings);

    (wrapped as OpenAILike).embeddings = {
      create: async (...args: unknown[]): Promise<unknown> => {
        const agentClient = getGlobalClient();
        const session = getGlobalSession();

        if (!agentClient || !session) {
          return originalEmbCreate(...args);
        }

        const params = (args[0] ?? {}) as Record<string, unknown>;
        const span = session.createSpan('openai.embeddings.create', SpanType.LLM);

        span.setInput(params);

        if (typeof params.model === 'string') {
          span.setModel(params.model);
        }

        try {
          const response = (await originalEmbCreate(...args)) as EmbeddingResponse;

          if (response.model) {
            span.setModel(response.model);
          }

          if (response.usage) {
            span.setTokens(response.usage.prompt_tokens ?? 0, 0);
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
