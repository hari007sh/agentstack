import { randomUUID } from 'crypto';
import {
  HealingConfig,
  HealingEvent,
  HealingIntervention,
  HealingType,
} from './types';
import { AgentStackClient } from './client';

// ─── Default configuration ──────────────────────────────────────────────────

const DEFAULT_HEALING_CONFIG: HealingConfig = {
  enabled: true,
  loopDetection: {
    enabled: true,
    maxRepeats: 3,
    windowSize: 10,
  },
  costBreaker: {
    enabled: true,
    maxCostPerSession: 10.0,
    maxCostPerSpan: 2.0,
  },
  hallucinationCatch: {
    enabled: true,
    confidenceThreshold: 0.7,
  },
  timeoutRecovery: {
    enabled: true,
    maxDurationMs: 30000,
  },
  contextOverflow: {
    enabled: true,
    maxTokens: 128000,
    strategy: 'truncate',
  },
};

// ─── HealingEngine ──────────────────────────────────────────────────────────

export class HealingEngine {
  private config: HealingConfig;
  private client: AgentStackClient | null;

  // Loop detection state
  private recentOutputs: string[] = [];

  // Cost tracking state
  private sessionCost = 0;

  constructor(config?: Partial<HealingConfig>, client?: AgentStackClient) {
    this.config = {
      ...DEFAULT_HEALING_CONFIG,
      ...config,
      loopDetection: { ...DEFAULT_HEALING_CONFIG.loopDetection!, ...config?.loopDetection },
      costBreaker: { ...DEFAULT_HEALING_CONFIG.costBreaker!, ...config?.costBreaker },
      hallucinationCatch: {
        ...DEFAULT_HEALING_CONFIG.hallucinationCatch!,
        ...config?.hallucinationCatch,
      },
      timeoutRecovery: { ...DEFAULT_HEALING_CONFIG.timeoutRecovery!, ...config?.timeoutRecovery },
      contextOverflow: { ...DEFAULT_HEALING_CONFIG.contextOverflow!, ...config?.contextOverflow },
    };

    this.client = client ?? null;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // ── Loop Detection ────────────────────────────────────────────────────

  checkLoop(output: string, sessionId: string): HealingEvent | null {
    if (!this.config.enabled || !this.config.loopDetection?.enabled) return null;

    const { maxRepeats, windowSize } = this.config.loopDetection;

    this.recentOutputs.push(output);
    if (this.recentOutputs.length > windowSize) {
      this.recentOutputs = this.recentOutputs.slice(-windowSize);
    }

    // Count how many of the recent outputs match the current one
    const repeatCount = this.recentOutputs.filter((o) => o === output).length;

    if (repeatCount >= maxRepeats) {
      const intervention: HealingIntervention = {
        action: 'modify_input',
        description: `Loop detected: output repeated ${repeatCount} times in last ${windowSize} calls. Modifying input to break loop.`,
        modifiedInput: `[LOOP DETECTED] The previous response was repeated ${repeatCount} times. Please provide a different response or approach.`,
      };

      const event = this.createHealingEvent(
        sessionId,
        'loop_detection',
        `Output repeated ${repeatCount}/${maxRepeats} times`,
        intervention,
      );

      // Reset after detection
      this.recentOutputs = [];
      return event;
    }

    return null;
  }

  // ── Cost Breaker ──────────────────────────────────────────────────────

  checkCost(
    cost: number,
    sessionId: string,
    spanId?: string,
  ): HealingEvent | null {
    if (!this.config.enabled || !this.config.costBreaker?.enabled) return null;

    const { maxCostPerSession, maxCostPerSpan } = this.config.costBreaker;

    // Per-span check
    if (cost > maxCostPerSpan) {
      const intervention: HealingIntervention = {
        action: 'abort',
        description: `Span cost $${cost.toFixed(4)} exceeds limit $${maxCostPerSpan.toFixed(2)}. Aborting span.`,
      };

      return this.createHealingEvent(
        sessionId,
        'cost_breaker',
        `Span cost $${cost.toFixed(4)} > $${maxCostPerSpan.toFixed(2)}`,
        intervention,
        spanId,
      );
    }

    // Per-session check
    this.sessionCost += cost;
    if (this.sessionCost > maxCostPerSession) {
      const intervention: HealingIntervention = {
        action: 'abort',
        description: `Session cost $${this.sessionCost.toFixed(4)} exceeds limit $${maxCostPerSession.toFixed(2)}. Aborting session.`,
      };

      return this.createHealingEvent(
        sessionId,
        'cost_breaker',
        `Session cost $${this.sessionCost.toFixed(4)} > $${maxCostPerSession.toFixed(2)}`,
        intervention,
        spanId,
      );
    }

    return null;
  }

  // ── Hallucination Catch ───────────────────────────────────────────────

  checkHallucination(
    confidence: number,
    sessionId: string,
    spanId?: string,
  ): HealingEvent | null {
    if (!this.config.enabled || !this.config.hallucinationCatch?.enabled) return null;

    const { confidenceThreshold } = this.config.hallucinationCatch;

    if (confidence < confidenceThreshold) {
      const intervention: HealingIntervention = {
        action: 'retry',
        description: `Low confidence score ${confidence.toFixed(2)} (threshold: ${confidenceThreshold.toFixed(2)}). Retrying with modified prompt.`,
        modifiedInput:
          '[LOW CONFIDENCE] The previous response had low confidence. Please provide a more certain, well-grounded response.',
      };

      return this.createHealingEvent(
        sessionId,
        'hallucination_catch',
        `Confidence ${confidence.toFixed(2)} < ${confidenceThreshold.toFixed(2)}`,
        intervention,
        spanId,
      );
    }

    return null;
  }

  // ── Timeout Recovery ──────────────────────────────────────────────────

  checkTimeout(
    durationMs: number,
    sessionId: string,
    spanId?: string,
  ): HealingEvent | null {
    if (!this.config.enabled || !this.config.timeoutRecovery?.enabled) return null;

    const { maxDurationMs } = this.config.timeoutRecovery;

    if (durationMs > maxDurationMs) {
      const intervention: HealingIntervention = {
        action: 'fallback',
        description: `Operation took ${durationMs}ms, exceeding timeout of ${maxDurationMs}ms. Falling back to cached or default response.`,
        fallbackResult: { error: 'timeout', message: 'Operation timed out, using fallback' },
      };

      return this.createHealingEvent(
        sessionId,
        'timeout_recovery',
        `Duration ${durationMs}ms > ${maxDurationMs}ms`,
        intervention,
        spanId,
      );
    }

    return null;
  }

  // ── Context Overflow ──────────────────────────────────────────────────

  checkContextOverflow(
    tokenCount: number,
    sessionId: string,
    spanId?: string,
  ): HealingEvent | null {
    if (!this.config.enabled || !this.config.contextOverflow?.enabled) return null;

    const { maxTokens, strategy } = this.config.contextOverflow;

    if (tokenCount > maxTokens) {
      let intervention: HealingIntervention;

      switch (strategy) {
        case 'truncate':
          intervention = {
            action: 'modify_input',
            description: `Token count ${tokenCount} exceeds limit ${maxTokens}. Truncating context.`,
            modifiedInput: `[CONTEXT TRUNCATED] Original context exceeded ${maxTokens} tokens. Keeping most recent context.`,
          };
          break;
        case 'summarize':
          intervention = {
            action: 'modify_input',
            description: `Token count ${tokenCount} exceeds limit ${maxTokens}. Summarizing context.`,
            modifiedInput: `[CONTEXT SUMMARIZED] Original context of ${tokenCount} tokens was summarized to fit within ${maxTokens} token limit.`,
          };
          break;
        case 'fail':
          intervention = {
            action: 'abort',
            description: `Token count ${tokenCount} exceeds limit ${maxTokens}. Aborting.`,
          };
          break;
      }

      return this.createHealingEvent(
        sessionId,
        'context_overflow',
        `Tokens ${tokenCount} > ${maxTokens} (strategy: ${strategy})`,
        intervention,
        spanId,
      );
    }

    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  resetSessionCost(): void {
    this.sessionCost = 0;
  }

  resetLoopHistory(): void {
    this.recentOutputs = [];
  }

  private createHealingEvent(
    sessionId: string,
    type: HealingType,
    trigger: string,
    intervention: HealingIntervention,
    spanId?: string,
  ): HealingEvent {
    const event: HealingEvent = {
      id: randomUUID(),
      sessionId,
      spanId,
      type,
      trigger,
      intervention,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    if (this.client) {
      this.client.addHealingEvent(event);
    }

    return event;
  }
}
