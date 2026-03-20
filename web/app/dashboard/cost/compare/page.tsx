"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  Calculator,
} from "lucide-react";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonTable, SkeletonBlock } from "@/components/skeleton";

// --- Mock Data ---
interface ModelComparison {
  model: string;
  provider: string;
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  avg_latency_ms: number;
  quality_score: number;
}

const mockModels: ModelComparison[] = [
  {
    model: "gpt-4o",
    provider: "OpenAI",
    input_cost_per_1m: 2.50,
    output_cost_per_1m: 10.00,
    avg_latency_ms: 320,
    quality_score: 94.2,
  },
  {
    model: "gpt-4o-mini",
    provider: "OpenAI",
    input_cost_per_1m: 0.15,
    output_cost_per_1m: 0.60,
    avg_latency_ms: 185,
    quality_score: 87.1,
  },
  {
    model: "claude-3-5-sonnet",
    provider: "Anthropic",
    input_cost_per_1m: 3.00,
    output_cost_per_1m: 15.00,
    avg_latency_ms: 280,
    quality_score: 95.8,
  },
  {
    model: "claude-3-5-haiku",
    provider: "Anthropic",
    input_cost_per_1m: 0.80,
    output_cost_per_1m: 4.00,
    avg_latency_ms: 140,
    quality_score: 88.5,
  },
  {
    model: "gemini-1.5-pro",
    provider: "Google",
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 5.00,
    avg_latency_ms: 350,
    quality_score: 91.3,
  },
  {
    model: "llama-3.1-70b",
    provider: "Together",
    input_cost_per_1m: 0.88,
    output_cost_per_1m: 0.88,
    avg_latency_ms: 410,
    quality_score: 85.7,
  },
  {
    model: "mixtral-8x7b",
    provider: "Groq",
    input_cost_per_1m: 0.24,
    output_cost_per_1m: 0.24,
    avg_latency_ms: 95,
    quality_score: 79.4,
  },
  {
    model: "mistral-large",
    provider: "Mistral",
    input_cost_per_1m: 2.00,
    output_cost_per_1m: 6.00,
    avg_latency_ms: 260,
    quality_score: 89.6,
  },
];

const providerColors: Record<string, string> = {
  OpenAI: "var(--accent-green)",
  Anthropic: "var(--accent-amber)",
  Google: "var(--accent-blue)",
  Together: "var(--accent-purple)",
  Groq: "var(--healing-blue)",
  Mistral: "var(--accent-red)",
};

export default function ModelComparePage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockModels.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Model Comparison</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Compare cost, latency, and quality across models and providers
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <SkeletonTable rows={8} cols={6} />
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <SkeletonBlock className="h-5 w-40 mb-4" />
            <SkeletonBlock className="h-32 w-full" />
          </div>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <ArrowLeftRight className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No model data available</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Model comparison data will populate as requests flow through the
            gateway.
          </p>
        </div>
      )}

      {/* Comparison Table */}
      {!loading && mockModels.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium">Cost and Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {[
                    "Model",
                    "Provider",
                    "Input Cost / 1M",
                    "Output Cost / 1M",
                    "Avg Latency",
                    "Quality Score",
                  ].map((header) => (
                    <th
                      key={header}
                      className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockModels.map((model) => {
                  const pColor =
                    providerColors[model.provider] || "var(--text-tertiary)";
                  return (
                    <motion.tr
                      key={model.model}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3 text-sm font-mono font-medium">
                        {model.model}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${pColor} 12%, transparent)`,
                            color: pColor,
                          }}
                        >
                          {model.provider}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        ${model.input_cost_per_1m.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        ${model.output_cost_per_1m.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-sm">
                        <span
                          style={{
                            color:
                              model.avg_latency_ms > 400
                                ? "var(--accent-red)"
                                : model.avg_latency_ms > 200
                                ? "var(--accent-amber)"
                                : "var(--accent-green)",
                          }}
                        >
                          {model.avg_latency_ms}ms
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden max-w-[80px]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${model.quality_score}%`,
                                backgroundColor:
                                  model.quality_score >= 90
                                    ? "var(--accent-green)"
                                    : model.quality_score >= 80
                                    ? "var(--accent-amber)"
                                    : "var(--accent-red)",
                              }}
                            />
                          </div>
                          <span
                            className="text-sm font-medium"
                            style={{
                              color:
                                model.quality_score >= 90
                                  ? "var(--accent-green)"
                                  : model.quality_score >= 80
                                  ? "var(--accent-amber)"
                                  : "var(--accent-red)",
                            }}
                          >
                            {model.quality_score.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* What-if Calculator Placeholder */}
      {!loading && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
          <h3 className="text-sm font-medium mb-4">What-if Calculator</h3>
          <div className="h-32 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
            <div className="text-center">
              <Calculator className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>
                Estimate cost impact of switching models. Coming soon.
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
