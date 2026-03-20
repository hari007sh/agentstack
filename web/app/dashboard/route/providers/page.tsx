"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Server,
  Plus,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";

// --- Mock Data ---
interface ProviderCard {
  id: string;
  name: string;
  display_name: string;
  enabled: boolean;
  model_count: number;
  request_count: number;
  color: string;
}

const mockProviders: ProviderCard[] = [
  {
    id: "prov_1",
    name: "openai",
    display_name: "OpenAI",
    enabled: true,
    model_count: 6,
    request_count: 82450,
    color: "var(--accent-green)",
  },
  {
    id: "prov_2",
    name: "anthropic",
    display_name: "Anthropic",
    enabled: true,
    model_count: 4,
    request_count: 45200,
    color: "var(--accent-amber)",
  },
  {
    id: "prov_3",
    name: "google",
    display_name: "Google AI",
    enabled: true,
    model_count: 3,
    request_count: 28100,
    color: "var(--accent-blue)",
  },
  {
    id: "prov_4",
    name: "together",
    display_name: "Together AI",
    enabled: true,
    model_count: 8,
    request_count: 18900,
    color: "var(--accent-purple)",
  },
  {
    id: "prov_5",
    name: "groq",
    display_name: "Groq",
    enabled: false,
    model_count: 4,
    request_count: 5200,
    color: "var(--healing-blue)",
  },
  {
    id: "prov_6",
    name: "mistral",
    display_name: "Mistral AI",
    enabled: false,
    model_count: 3,
    request_count: 0,
    color: "var(--accent-red)",
  },
];

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ProvidersPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockProviders.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Providers</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage LLM provider connections and API keys
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]">
          <Plus className="w-4 h-4" />
          Add Provider
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <SkeletonBlock className="w-10 h-10 rounded-lg" />
                <div>
                  <SkeletonBlock className="h-4 w-24 mb-1" />
                  <SkeletonBlock className="h-3 w-16" />
                </div>
              </div>
              <div className="flex gap-4">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <Server className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No providers configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Add an LLM provider to start routing requests through the gateway.
          </p>
        </div>
      )}

      {/* Provider Cards Grid */}
      {!loading && mockProviders.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {mockProviders.map((provider) => (
            <motion.div
              key={provider.id}
              variants={staggerItem}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--border-default)] transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {/* Provider Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${provider.color} 15%, transparent)`,
                      color: provider.color,
                    }}
                  >
                    {provider.display_name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {provider.display_name}
                    </p>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
                      {provider.name}
                    </p>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  {provider.enabled ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                      <span className="text-xs text-[var(--accent-green)]">
                        Enabled
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      <span className="text-xs text-[var(--text-tertiary)]">
                        Disabled
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 pt-3 border-t border-[var(--border-subtle)]">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Models
                  </p>
                  <p className="text-sm font-medium mt-0.5">
                    {provider.model_count}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Requests
                  </p>
                  <p className="text-sm font-medium mt-0.5">
                    {formatCount(provider.request_count)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
