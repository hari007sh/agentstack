/**
 * Guard module — stub for guardrail checks.
 *
 * Future implementation will include:
 * - PII detection and redaction
 * - Prompt injection detection
 * - Toxicity filtering
 * - Custom validation rules
 */

export interface GuardRule {
  name: string;
  enabled: boolean;
  action: 'block' | 'warn' | 'redact';
}

export interface GuardResult {
  passed: boolean;
  violations: GuardViolation[];
}

export interface GuardViolation {
  rule: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Run all enabled guard rules against the given input.
 * Stub implementation — always passes.
 */
export function runGuards(
  _input: string,
  _rules: GuardRule[] = [],
): GuardResult {
  return {
    passed: true,
    violations: [],
  };
}

/**
 * Check a single guard rule against input.
 * Stub implementation — always passes.
 */
export function checkGuard(
  _input: string,
  _rule: GuardRule,
): GuardViolation | null {
  return null;
}
