import { SpanType, TraceOptions } from './types';
import { SpanInstance } from './span';
import { getGlobalClient, getGlobalSession } from './index';

/**
 * Wraps an async function with automatic span creation, input/output capture,
 * and error tracking.
 *
 * @example
 * ```ts
 * const result = await trace('generateResponse', { type: SpanType.LLM }, async (span) => {
 *   span.setModel('gpt-4');
 *   const response = await openai.chat.completions.create({ ... });
 *   return response;
 * });
 * ```
 */
export async function trace<T>(
  name: string,
  fn: (span: SpanInstance) => Promise<T>,
): Promise<T>;
export async function trace<T>(
  name: string,
  options: TraceOptions,
  fn: (span: SpanInstance) => Promise<T>,
): Promise<T>;
export async function trace<T>(
  name: string,
  optionsOrFn: TraceOptions | ((span: SpanInstance) => Promise<T>),
  maybeFn?: (span: SpanInstance) => Promise<T>,
): Promise<T> {
  const options: TraceOptions = typeof optionsOrFn === 'function' ? {} : optionsOrFn;
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn!;

  const client = getGlobalClient();
  const session = getGlobalSession();

  if (!client || !session) {
    // If SDK is not initialized, just run the function without tracing
    return fn(null as unknown as SpanInstance);
  }

  const span = session.createSpan(
    options.name ?? name,
    options.type ?? SpanType.CUSTOM,
    options.parentSpanId,
    options.metadata,
  );

  try {
    const result = await fn(span);

    if (options.captureOutput !== false) {
      span.setOutput(result);
    }

    span.end();
    return result;
  } catch (err) {
    span.setError(err instanceof Error ? err : new Error(String(err)));
    span.end();
    throw err;
  }
}
