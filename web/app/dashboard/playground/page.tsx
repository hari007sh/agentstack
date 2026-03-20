"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Timer,
  Coins,
  Hash,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  Clock,
  Trash2,
  RotateCcw,
  Zap,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { fadeIn } from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";

// --- Types ---

/** Provider record from GET /v1/gateway/providers */
interface ProviderRecord {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
}

interface ModelConfig {
  id: string;
  name: string;
  provider: string;       // backend provider name, e.g. "openai"
  providerDisplay: string; // display name, e.g. "OpenAI"
  providerColor: string;
  badge: string;
}

interface OutputData {
  text: string;
  tokens_in: number;
  tokens_out: number;
  latency: number;
  cost: string;
  displayedText: string;
  error?: string;
}

interface HistoryEntry {
  id: string;
  prompt: string;
  model: string;
  timestamp: Date;
  tokens: number;
  latency: number;
  cost: string;
}

// --- Constants ---

/** Well-known provider colors for display */
const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d4a574",
  google: "#4285f4",
  mistral: "#ff7000",
  together: "#6366f1",
  groq: "#f97316",
  meta: "#0668e1",
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  mistral: "Mistral",
  together: "Together",
  groq: "Groq",
  meta: "Meta",
};

const PROVIDER_ICONS: Record<string, string> = {
  openai: "OA",
  anthropic: "AN",
  google: "GG",
  mistral: "MI",
  together: "TG",
  groq: "GQ",
  meta: "ME",
};

/**
 * Well-known models per provider. Used as a catalog when providers are configured
 * but no models list is available from the API. The user can still type in any
 * model name; these are just the common options that show up in the picker.
 */
const KNOWN_MODELS: Record<string, { id: string; name: string; badge: string }[]> = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o", badge: "Latest" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", badge: "Fast" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", badge: "" },
    { id: "o1", name: "o1", badge: "Reasoning" },
    { id: "o1-mini", name: "o1 Mini", badge: "Fast" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", badge: "Latest" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", badge: "Balanced" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", badge: "Fast" },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus", badge: "Powerful" },
  ],
  google: [
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", badge: "" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", badge: "Fast" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", badge: "Latest" },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large", badge: "" },
    { id: "mistral-small-latest", name: "Mistral Small", badge: "Fast" },
    { id: "mixtral-8x7b-instruct", name: "Mixtral 8x7B", badge: "" },
  ],
  together: [
    { id: "meta-llama/Llama-3-70b-chat-hf", name: "Llama 3 70B", badge: "Open" },
    { id: "meta-llama/Llama-3-8b-chat-hf", name: "Llama 3 8B", badge: "Fast" },
  ],
  groq: [
    { id: "llama3-70b-8192", name: "Llama 3 70B", badge: "Fast" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", badge: "" },
  ],
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// --- Helper: build model catalog from providers ---
function buildModelCatalog(providers: ProviderRecord[]): ModelConfig[] {
  const models: ModelConfig[] = [];
  for (const p of providers) {
    if (!p.is_enabled) continue;
    const known = KNOWN_MODELS[p.name] || [];
    if (known.length === 0) {
      // Unknown provider — add a single generic entry
      models.push({
        id: `${p.name}:default`,
        name: p.display_name || p.name,
        provider: p.name,
        providerDisplay: p.display_name || PROVIDER_DISPLAY_NAMES[p.name] || p.name,
        providerColor: PROVIDER_COLORS[p.name] || "#666",
        badge: "",
      });
    } else {
      for (const m of known) {
        models.push({
          id: m.id,
          name: m.name,
          provider: p.name,
          providerDisplay: p.display_name || PROVIDER_DISPLAY_NAMES[p.name] || p.name,
          providerColor: PROVIDER_COLORS[p.name] || "#666",
          badge: m.badge,
        });
      }
    }
  }
  return models;
}

// --- Slider Component ---
function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  tooltip,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  tooltip: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="text-xs text-[var(--text-secondary)] cursor-help hover:text-[var(--text-primary)] transition-colors">
                {label}
              </label>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              className="bg-[var(--bg-tertiary)] border-[var(--border-default)] text-[var(--text-secondary)] text-xs max-w-[200px]"
            >
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-xs font-mono text-[var(--accent-blue)] tabular-nums">
          {value.toFixed(step < 1 ? 1 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-[var(--bg-hover)] rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[var(--accent-blue)]
          [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(59,130,246,0.4)]
          [&::-webkit-slider-thumb]:transition-shadow
          [&::-webkit-slider-thumb]:hover:shadow-[0_0_10px_rgba(59,130,246,0.6)]
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-[var(--accent-blue)]
          [&::-moz-range-thumb]:border-0"
      />
      <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// --- Provider Icon ---
function ProviderIcon({ provider, color }: { provider: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold shrink-0"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {PROVIDER_ICONS[provider] || provider.slice(0, 2).toUpperCase()}
    </span>
  );
}

// --- Streaming Dots ---
function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] animate-[bounce_1s_ease-in-out_infinite]" />
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] animate-[bounce_1s_ease-in-out_0.15s_infinite]" />
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] animate-[bounce_1s_ease-in-out_0.3s_infinite]" />
    </span>
  );
}

// --- Output Panel ---
function OutputPanel({
  modelId,
  models,
  output,
  isStreaming,
  onCopy,
  copied,
}: {
  modelId: string;
  models: ModelConfig[];
  output: OutputData | null;
  isStreaming: boolean;
  onCopy: (text: string) => void;
  copied: string | null;
}) {
  const modelConfig = models.find((m) => m.id === modelId);
  const isComplete = output && !isStreaming && !output.error;
  const totalTokens = output ? (output.tokens_in + output.tokens_out) : 0;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden flex flex-col h-full">
      {/* Output header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {modelConfig && (
            <ProviderIcon provider={modelConfig.provider} color={modelConfig.providerColor} />
          )}
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {modelConfig?.name || modelId}
          </span>
          {isStreaming && !output?.error && (
            <Badge className="bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20 text-[10px] px-1.5 py-0 h-4">
              Streaming
            </Badge>
          )}
          {isComplete && (
            <Badge className="bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20 text-[10px] px-1.5 py-0 h-4">
              Complete
            </Badge>
          )}
          {output?.error && (
            <Badge className="bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/20 text-[10px] px-1.5 py-0 h-4">
              Error
            </Badge>
          )}
        </div>
        {output && !output.error && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <Hash className="w-3 h-3" />
              <span className="tabular-nums">{totalTokens}</span>
              <span className="hidden sm:inline">tokens</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <Timer className="w-3 h-3" />
              <span className="tabular-nums">{output.latency}ms</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <Coins className="w-3 h-3" />
              <span className="tabular-nums">{output.cost}</span>
            </div>
            <Separator orientation="vertical" className="h-3 bg-[var(--border-subtle)]" />
            <button
              onClick={() => onCopy(output.text)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-0.5"
            >
              {copied === modelId ? (
                <Check className="w-3.5 h-3.5 text-[var(--accent-green)]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Output body */}
      <div className="p-4 flex-1 overflow-y-auto min-h-[200px]">
        {output?.error ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--accent-red)]/5 border border-[var(--accent-red)]/10">
            <AlertCircle className="w-4 h-4 text-[var(--accent-red)] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--accent-red)]">Execution failed</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{output.error}</p>
            </div>
          </div>
        ) : output ? (
          <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
            {output.displayedText}
            {isStreaming && (
              <span className="inline-block w-[2px] h-4 bg-[var(--accent-blue)] ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-blue)]" />
            Generating response
            <StreamingDots />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--text-tertiary)]" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-tertiary)]">No output yet</p>
              <p className="text-xs text-[var(--text-tertiary)]/60 mt-1">Run a prompt to see the response</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Cost estimation helper ---
function formatCostCents(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

// --- Main Page Component ---
export default function PlaygroundPage() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI assistant. Provide clear, well-structured responses with concrete examples when possible."
  );
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);

  // Model selections — these are model IDs like "gpt-4o"
  const [model, setModel] = useState("");
  const [compareModelA, setCompareModelA] = useState("");
  const [compareModelB, setCompareModelB] = useState("");

  // Provider data from API
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);

  // Parameters
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [topP, setTopP] = useState(1.0);

  // State
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<Record<string, OutputData>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Load providers from API on mount ---
  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const data = await api.get<ProviderRecord[]>("/v1/gateway/providers");
        if (cancelled) return;

        const list = Array.isArray(data) ? data : [];
        setProviders(list);

        const catalog = buildModelCatalog(list);
        setModels(catalog);

        // Set default selections
        if (catalog.length > 0) {
          setModel(catalog[0].id);
          setCompareModelA(catalog[0].id);
          setCompareModelB(catalog.length > 1 ? catalog[1].id : catalog[0].id);
        }

        setProvidersError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load providers:", err);
        setProvidersError(
          err instanceof Error ? err.message : "Failed to load providers"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProviders();
    return () => { cancelled = true; };
  }, []);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // --- Find provider name for a model ID ---
  const getProviderForModel = useCallback(
    (modelId: string): string => {
      const mc = models.find((m) => m.id === modelId);
      return mc?.provider || "";
    },
    [models]
  );

  // --- Execute single run with SSE streaming ---
  const executeSingleStream = useCallback(
    async (
      modelId: string,
      providerName: string,
      abortSignal: AbortSignal
    ) => {
      // Initialize output
      setOutputs((prev) => ({
        ...prev,
        [modelId]: {
          text: "",
          tokens_in: 0,
          tokens_out: 0,
          latency: 0,
          cost: "$0.00",
          displayedText: "",
        },
      }));

      const body = JSON.stringify({
        body: prompt,
        system_prompt: systemPrompt,
        model: modelId,
        provider: providerName,
        stream: true,
        config: {
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
        },
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Try to get auth token from cookie or localStorage
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("auth_token") || ""
          : "";
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/v1/playground/execute`, {
        method: "POST",
        headers,
        body,
        signal: abortSignal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({
          error: { message: response.statusText },
        }));
        const errMsg =
          errBody?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        setOutputs((prev) => ({
          ...prev,
          [modelId]: {
            text: "",
            tokens_in: 0,
            tokens_out: 0,
            latency: 0,
            cost: "$0.00",
            displayedText: "",
            error: errMsg,
          },
        }));
        return;
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        setOutputs((prev) => ({
          ...prev,
          [modelId]: {
            ...prev[modelId],
            error: "No response body",
          },
        }));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            if (event.type === "token" && event.content) {
              fullText += event.content;
              setOutputs((prev) => ({
                ...prev,
                [modelId]: {
                  ...prev[modelId],
                  text: fullText,
                  displayedText: fullText,
                },
              }));
            }

            if (event.type === "done") {
              setOutputs((prev) => ({
                ...prev,
                [modelId]: {
                  ...prev[modelId],
                  text: fullText,
                  displayedText: fullText,
                  tokens_in: event.tokens_in || 0,
                  tokens_out: event.tokens_out || 0,
                  latency: event.latency_ms || 0,
                  cost: formatCostCents(event.cost_cents || 0),
                },
              }));
            }
          } catch {
            // skip malformed SSE data
          }
        }
      }
    },
    [prompt, systemPrompt, temperature, maxTokens, topP]
  );

  // --- Execute single run (non-streaming fallback) ---
  const executeNonStreaming = useCallback(
    async (modelId: string, providerName: string): Promise<OutputData> => {
      const resp = await api.post<{
        data: {
          output: string;
          model: string;
          provider: string;
          tokens_in: number;
          tokens_out: number;
          cost_cents: number;
          latency_ms: number;
          finish_reason: string;
        };
      }>("/v1/playground/execute", {
        body: prompt,
        system_prompt: systemPrompt,
        model: modelId,
        provider: providerName,
        stream: false,
        config: {
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
        },
      });

      const d = resp.data;
      return {
        text: d.output,
        tokens_in: d.tokens_in,
        tokens_out: d.tokens_out,
        latency: d.latency_ms,
        cost: formatCostCents(d.cost_cents),
        displayedText: d.output,
      };
    },
    [prompt, systemPrompt, temperature, maxTokens, topP]
  );

  // --- Execute compare mode ---
  const executeCompare = useCallback(
    async (modelA: string, modelB: string, abortSignal: AbortSignal) => {
      const providerA = getProviderForModel(modelA);
      const providerB = getProviderForModel(modelB);

      if (!providerA || !providerB) {
        setOutputs({
          [modelA]: {
            text: "",
            tokens_in: 0,
            tokens_out: 0,
            latency: 0,
            cost: "$0.00",
            displayedText: "",
            error: !providerA
              ? "No provider found for model " + modelA
              : "No provider found for model " + modelB,
          },
        });
        return;
      }

      // Initialize both outputs
      setOutputs({
        [modelA]: {
          text: "",
          tokens_in: 0,
          tokens_out: 0,
          latency: 0,
          cost: "$0.00",
          displayedText: "",
        },
        [modelB]: {
          text: "",
          tokens_in: 0,
          tokens_out: 0,
          latency: 0,
          cost: "$0.00",
          displayedText: "",
        },
      });

      try {
        const resp = await api.post<{
          data: {
            results: Array<{
              output: string;
              model: string;
              provider: string;
              tokens_in: number;
              tokens_out: number;
              cost_cents: number;
              latency_ms: number;
              finish_reason: string;
            }>;
          };
        }>("/v1/playground/compare", {
          body: prompt,
          system_prompt: systemPrompt,
          models: [
            { model: modelA, provider: providerA },
            { model: modelB, provider: providerB },
          ],
          config: {
            temperature,
            max_tokens: maxTokens,
            top_p: topP,
          },
        });

        if (abortSignal.aborted) return;

        const results = resp.data.results;
        const newOutputs: Record<string, OutputData> = {};

        for (const r of results) {
          const isError = r.output.startsWith("Error:");
          newOutputs[r.model] = {
            text: r.output,
            tokens_in: r.tokens_in,
            tokens_out: r.tokens_out,
            latency: r.latency_ms,
            cost: formatCostCents(r.cost_cents),
            displayedText: r.output,
            error: isError ? r.output : undefined,
          };
        }

        setOutputs(newOutputs);
      } catch (err) {
        if (abortSignal.aborted) return;
        const errMsg = err instanceof Error ? err.message : "Compare failed";
        setOutputs({
          [modelA]: {
            text: "",
            tokens_in: 0,
            tokens_out: 0,
            latency: 0,
            cost: "$0.00",
            displayedText: "",
            error: errMsg,
          },
          [modelB]: {
            text: "",
            tokens_in: 0,
            tokens_out: 0,
            latency: 0,
            cost: "$0.00",
            displayedText: "",
            error: errMsg,
          },
        });
      }
    },
    [prompt, systemPrompt, temperature, maxTokens, topP, getProviderForModel]
  );

  // --- Run handler ---
  const handleRun = useCallback(async () => {
    if (!prompt.trim() || running) return;

    // Abort any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setOutputs({});

    try {
      if (mode === "compare") {
        await executeCompare(compareModelA, compareModelB, controller.signal);

        // Add to history
        const mcA = models.find((m) => m.id === compareModelA);
        const mcB = models.find((m) => m.id === compareModelB);
        setHistory((prev) => [
          {
            id: `h${Date.now()}`,
            prompt: prompt.slice(0, 100),
            model: `${mcA?.name || compareModelA} vs ${mcB?.name || compareModelB}`,
            timestamp: new Date(),
            tokens: 0,
            latency: 0,
            cost: "$0.00",
          },
          ...prev,
        ]);
      } else {
        const providerName = getProviderForModel(model);
        if (!providerName) {
          setOutputs({
            [model]: {
              text: "",
              tokens_in: 0,
              tokens_out: 0,
              latency: 0,
              cost: "$0.00",
              displayedText: "",
              error: "No provider configured for this model. Add a provider in Route > Providers.",
            },
          });
          return;
        }

        await executeSingleStream(model, providerName, controller.signal);

        // Add to history with final output data
        setOutputs((currentOutputs) => {
          const out = currentOutputs[model];
          if (out && !out.error) {
            setHistory((prev) => [
              {
                id: `h${Date.now()}`,
                prompt: prompt.slice(0, 100),
                model: model,
                timestamp: new Date(),
                tokens: out.tokens_in + out.tokens_out,
                latency: out.latency,
                cost: out.cost,
              },
              ...prev,
            ]);
          }
          return currentOutputs;
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Playground execution error:", err);
    } finally {
      if (!controller.signal.aborted) {
        setRunning(false);
      }
    }
  }, [
    prompt,
    running,
    mode,
    model,
    compareModelA,
    compareModelB,
    models,
    getProviderForModel,
    executeSingleStream,
    executeCompare,
  ]);

  const handleCopy = useCallback((text: string, modelId?: string) => {
    navigator.clipboard.writeText(text);
    setCopied(modelId || "single");
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const handleHistoryClick = useCallback((entry: HistoryEntry) => {
    setPrompt(entry.prompt);
    if (!entry.model.includes("vs")) {
      setModel(entry.model);
      setMode("single");
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    },
    [handleRun]
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Group models by provider for the select dropdown
  const modelsByProvider = models.reduce<Record<string, ModelConfig[]>>((acc, m) => {
    const key = m.providerDisplay;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  // --- Render ---
  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="h-full flex flex-col"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-1 mb-5">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Playground</h1>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                Test prompts, compare models, and iterate on outputs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setHistoryOpen(!historyOpen)}
                  className={cn(
                    "h-8 w-8 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
                    historyOpen && "text-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                  )}
                >
                  {historyOpen ? (
                    <PanelRightClose className="w-4 h-4" />
                  ) : (
                    <PanelRightOpen className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-[var(--bg-tertiary)] border-[var(--border-default)] text-xs"
              >
                {historyOpen ? "Hide history" : "Show history"}
              </TooltipContent>
            </Tooltip>
            <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[10px] text-[var(--text-tertiary)]">
              <span className="text-[11px]">&#8984;</span> + Enter to run
            </kbd>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex-1 grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-8 space-y-4">
              <SkeletonBlock className="h-10 w-64 rounded-lg" />
              <SkeletonBlock className="h-[120px] w-full rounded-xl" />
              <SkeletonBlock className="h-[300px] w-full rounded-xl" />
            </div>
            <div className="col-span-12 lg:col-span-4 space-y-4">
              <SkeletonBlock className="h-[480px] w-full rounded-xl" />
            </div>
          </div>
        )}

        {/* No providers configured */}
        {!loading && models.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-hover)] flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-[var(--text-tertiary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                No providers configured
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md">
                {providersError
                  ? `Could not load providers: ${providersError}`
                  : "Add an LLM provider (OpenAI, Anthropic, etc.) in the Route > Providers page to start using the playground."}
              </p>
            </div>
            <a
              href="/dashboard/route/providers"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 transition-colors"
            >
              Configure Providers
            </a>
          </div>
        )}

        {!loading && models.length > 0 && (
          <div className="flex-1 flex gap-4 min-h-0">
            {/* Main Content */}
            <div className={cn("flex-1 flex flex-col min-w-0", historyOpen && "lg:mr-0")}>
              {/* Mode Tabs */}
              <Tabs
                value={mode}
                onValueChange={(v) => {
                  setMode(v as "single" | "compare");
                  setOutputs({});
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex items-center justify-between mb-4">
                  <TabsList className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] h-9">
                    <TabsTrigger
                      value="single"
                      className="text-xs data-[state=active]:bg-[var(--accent-blue)]/15 data-[state=active]:text-[var(--accent-blue)] data-[state=active]:shadow-none px-4 h-7"
                    >
                      <Zap className="w-3 h-3 mr-1.5" />
                      Single Run
                    </TabsTrigger>
                    <TabsTrigger
                      value="compare"
                      className="text-xs data-[state=active]:bg-[var(--accent-purple)]/15 data-[state=active]:text-[var(--accent-purple)] data-[state=active]:shadow-none px-4 h-7"
                    >
                      <svg className="w-3 h-3 mr-1.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="1" y="2" width="5" height="12" rx="1" />
                        <rect x="10" y="2" width="5" height="12" rx="1" />
                      </svg>
                      Compare
                    </TabsTrigger>
                  </TabsList>

                  {/* Run button (always visible) */}
                  <Button
                    onClick={handleRun}
                    disabled={running || !prompt.trim()}
                    className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 h-9 px-5 text-sm font-medium shadow-[0_0_12px_rgba(59,130,246,0.2)] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all"
                  >
                    {running ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Running...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Play className="w-3.5 h-3.5" />
                        Run
                      </span>
                    )}
                  </Button>
                </div>

                {/* Content area */}
                <div className="flex-1 flex gap-4 min-h-0">
                  {/* Left column: System prompt + Prompt + Output */}
                  <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
                    {/* System Prompt (collapsible) */}
                    <motion.div
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden shrink-0"
                      layout
                    >
                      <button
                        onClick={() => setSystemPromptOpen(!systemPromptOpen)}
                        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-hover)]/50 transition-colors"
                      >
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          System Prompt
                        </span>
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200",
                            systemPromptOpen && "rotate-180"
                          )}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {systemPromptOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3">
                              <textarea
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] resize-none outline-none focus:border-[var(--accent-blue)]/50 transition-colors placeholder:text-[var(--text-tertiary)]"
                                placeholder="You are a helpful assistant..."
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* Model selector row — Single mode */}
                    <TabsContent value="single" className="mt-0 shrink-0">
                      <div className="flex items-center gap-3">
                        <Select value={model} onValueChange={setModel}>
                          <SelectTrigger className="w-[280px] h-9 bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-sm">
                            <SelectValue>
                              {(() => {
                                const mc = models.find((m) => m.id === model);
                                if (!mc) return model || "Select model";
                                return (
                                  <span className="flex items-center gap-2">
                                    <ProviderIcon provider={mc.provider} color={mc.providerColor} />
                                    <span className="text-[var(--text-primary)]">{mc.name}</span>
                                  </span>
                                );
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-[var(--bg-tertiary)] border-[var(--border-default)]">
                            {Object.entries(modelsByProvider).map(([providerDisplay, providerModels]) => (
                              <SelectGroup key={providerDisplay}>
                                <SelectLabel className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] pl-3 py-1">
                                  {providerDisplay}
                                </SelectLabel>
                                {providerModels.map((m) => (
                                  <SelectItem
                                    key={m.id}
                                    value={m.id}
                                    className="focus:bg-[var(--bg-hover)] focus:text-[var(--text-primary)]"
                                  >
                                    <span className="flex items-center gap-2">
                                      <ProviderIcon provider={m.provider} color={m.providerColor} />
                                      <span>{m.name}</span>
                                      {m.badge && (
                                        <span className="text-[9px] px-1.5 py-0 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                                          {m.badge}
                                        </span>
                                      )}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    {/* Model selector row — Compare mode */}
                    <TabsContent value="compare" className="mt-0 shrink-0">
                      <div className="flex items-center gap-3">
                        <Select value={compareModelA} onValueChange={setCompareModelA}>
                          <SelectTrigger className="flex-1 h-9 bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-sm">
                            <SelectValue>
                              {(() => {
                                const mc = models.find((m) => m.id === compareModelA);
                                if (!mc) return compareModelA || "Select model";
                                return (
                                  <span className="flex items-center gap-2">
                                    <ProviderIcon provider={mc.provider} color={mc.providerColor} />
                                    <span className="text-[var(--text-primary)] text-xs">{mc.name}</span>
                                  </span>
                                );
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-[var(--bg-tertiary)] border-[var(--border-default)]">
                            {models.map((m) => (
                              <SelectItem
                                key={m.id}
                                value={m.id}
                                className="focus:bg-[var(--bg-hover)] focus:text-[var(--text-primary)]"
                              >
                                <span className="flex items-center gap-2">
                                  <ProviderIcon provider={m.provider} color={m.providerColor} />
                                  <span>{m.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">vs</span>

                        <Select value={compareModelB} onValueChange={setCompareModelB}>
                          <SelectTrigger className="flex-1 h-9 bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-sm">
                            <SelectValue>
                              {(() => {
                                const mc = models.find((m) => m.id === compareModelB);
                                if (!mc) return compareModelB || "Select model";
                                return (
                                  <span className="flex items-center gap-2">
                                    <ProviderIcon provider={mc.provider} color={mc.providerColor} />
                                    <span className="text-[var(--text-primary)] text-xs">{mc.name}</span>
                                  </span>
                                );
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-[var(--bg-tertiary)] border-[var(--border-default)]">
                            {models.map((m) => (
                              <SelectItem
                                key={m.id}
                                value={m.id}
                                className="focus:bg-[var(--bg-hover)] focus:text-[var(--text-primary)]"
                              >
                                <span className="flex items-center gap-2">
                                  <ProviderIcon provider={m.provider} color={m.providerColor} />
                                  <span>{m.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    {/* Prompt Editor */}
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden shrink-0">
                      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          User Prompt
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">
                          {prompt.length} chars
                        </span>
                      </div>
                      <textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={5}
                        className="w-full bg-transparent px-4 py-3 text-sm text-[var(--text-primary)] resize-none outline-none placeholder:text-[var(--text-tertiary)] font-mono leading-relaxed"
                        placeholder="Enter your prompt..."
                      />
                    </div>

                    {/* Output Section */}
                    <TabsContent value="single" className="mt-0 flex-1 min-h-0">
                      <OutputPanel
                        modelId={model}
                        models={models}
                        output={outputs[model] || null}
                        isStreaming={running}
                        onCopy={(text) => handleCopy(text, model)}
                        copied={copied}
                      />
                    </TabsContent>

                    <TabsContent value="compare" className="mt-0 flex-1 min-h-0">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full">
                        <OutputPanel
                          modelId={compareModelA}
                          models={models}
                          output={outputs[compareModelA] || null}
                          isStreaming={running}
                          onCopy={(text) => handleCopy(text, compareModelA)}
                          copied={copied}
                        />
                        <OutputPanel
                          modelId={compareModelB}
                          models={models}
                          output={outputs[compareModelB] || null}
                          isStreaming={running}
                          onCopy={(text) => handleCopy(text, compareModelB)}
                          copied={copied}
                        />
                      </div>
                    </TabsContent>
                  </div>

                  {/* Right Sidebar: Parameters */}
                  <div className="hidden lg:flex w-[220px] shrink-0">
                    <div className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-5 h-fit">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          Parameters
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                setTemperature(0.7);
                                setMaxTokens(1024);
                                setTopP(1.0);
                              }}
                              className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="bg-[var(--bg-tertiary)] border-[var(--border-default)] text-xs"
                          >
                            Reset to defaults
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <ParamSlider
                        label="Temperature"
                        value={temperature}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={setTemperature}
                        tooltip="Controls randomness. Lower values are more focused, higher values more creative."
                      />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <label className="text-xs text-[var(--text-secondary)] cursor-help hover:text-[var(--text-primary)] transition-colors">
                                  Max Tokens
                                </label>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                className="bg-[var(--bg-tertiary)] border-[var(--border-default)] text-[var(--text-secondary)] text-xs max-w-[200px]"
                              >
                                Maximum number of tokens in the response.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <input
                          type="number"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(Math.max(1, Math.min(4096, parseInt(e.target.value) || 1)))}
                          min={1}
                          max={4096}
                          className="w-full h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs font-mono text-[var(--accent-blue)] outline-none focus:border-[var(--accent-blue)]/50 transition-colors tabular-nums"
                        />
                      </div>

                      <Separator className="bg-[var(--border-subtle)]" />

                      <ParamSlider
                        label="Top P"
                        value={topP}
                        min={0}
                        max={1}
                        step={0.1}
                        onChange={setTopP}
                        tooltip="Nucleus sampling. Controls diversity via cumulative probability cutoff."
                      />
                    </div>
                  </div>
                </div>
              </Tabs>
            </div>

            {/* History Sidebar */}
            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 260, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="hidden lg:block shrink-0 overflow-hidden"
                >
                  <div className="w-[260px] h-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col">
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          History
                        </span>
                        <Badge className="bg-[var(--bg-hover)] text-[var(--text-tertiary)] border-transparent text-[9px] px-1.5 py-0 h-4">
                          {history.length}
                        </Badge>
                      </div>
                      {history.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={handleClearHistory}
                              className="text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="bg-[var(--bg-tertiary)] border-[var(--border-default)] text-xs"
                          >
                            Clear history
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                          <Clock className="w-8 h-8 text-[var(--text-tertiary)]/30 mb-2" />
                          <p className="text-xs text-[var(--text-tertiary)]">No history yet</p>
                          <p className="text-[10px] text-[var(--text-tertiary)]/60 mt-1">
                            Run a prompt to see it here
                          </p>
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {history.map((entry) => {
                            const entryModel = models.find((m) => m.id === entry.model);
                            return (
                              <button
                                key={entry.id}
                                onClick={() => handleHistoryClick(entry)}
                                className="w-full text-left p-2.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group"
                              >
                                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 group-hover:text-[var(--text-primary)] transition-colors">
                                  {entry.prompt}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  {entryModel ? (
                                    <span
                                      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
                                      style={{
                                        backgroundColor: `${entryModel.providerColor}15`,
                                        color: entryModel.providerColor,
                                      }}
                                    >
                                      {entryModel.name}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-[var(--text-tertiary)]">
                                      {entry.model}
                                    </span>
                                  )}
                                  <span className="text-[9px] text-[var(--text-tertiary)] ml-auto tabular-nums">
                                    {formatTime(entry.timestamp)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[9px] text-[var(--text-tertiary)] tabular-nums">
                                    {entry.tokens} tok
                                  </span>
                                  <span className="text-[9px] text-[var(--text-tertiary)] tabular-nums">
                                    {entry.latency}ms
                                  </span>
                                  <span className="text-[9px] text-[var(--text-tertiary)] tabular-nums">
                                    {entry.cost}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </TooltipProvider>
  );
}
