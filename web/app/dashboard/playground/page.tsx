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
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
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

// --- Types ---
interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  providerColor: string;
  badge: string;
}

interface OutputData {
  text: string;
  tokens: number;
  latency: number;
  cost: string;
  displayedText: string;
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
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const MODELS: ModelConfig[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", providerColor: "#10a37f", badge: "Latest" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", providerColor: "#10a37f", badge: "Fast" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "OpenAI", providerColor: "#10a37f", badge: "" },
  { id: "claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic", providerColor: "#d4a574", badge: "Powerful" },
  { id: "claude-3-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", providerColor: "#d4a574", badge: "Balanced" },
  { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", providerColor: "#d4a574", badge: "Fast" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google", providerColor: "#4285f4", badge: "" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "Google", providerColor: "#4285f4", badge: "Fast" },
  { id: "mixtral-8x7b", name: "Mixtral 8x7B", provider: "Mistral", providerColor: "#ff7000", badge: "" },
  { id: "llama-3-70b", name: "Llama 3 70B", provider: "Meta", providerColor: "#0668e1", badge: "Open" },
];

const PROVIDER_ICONS: Record<string, string> = {
  OpenAI: "OA",
  Anthropic: "AN",
  Google: "GG",
  Mistral: "MI",
  Meta: "ME",
};

// --- Mock response data ---
const mockResponses: Record<string, { text: string; tokens: number; latency: number; cost: string }> = {
  "gpt-4o": {
    text: `Based on the analysis of recent developments in quantum computing, here are the key findings:

1. **Error Correction Breakthrough**: Researchers at IBM demonstrated a new error correction code that reduces logical error rates by 10x compared to previous methods. This brings us closer to fault-tolerant quantum computing.

2. **Scalability Progress**: Google's latest quantum processor achieved 70 qubits with improved coherence times, suggesting that 1000+ qubit systems may be achievable within 3-5 years.

3. **Practical Applications**: Several companies have demonstrated quantum advantage in optimization problems, particularly in supply chain logistics and drug discovery simulations.

4. **Hardware Diversity**: Trapped-ion systems from IonQ and photonic approaches from Xanadu are proving competitive with superconducting architectures, expanding the ecosystem.

The field is progressing faster than most experts predicted, with commercial viability for specific use cases expected by 2028.`,
    tokens: 187,
    latency: 2340,
    cost: "$0.0094",
  },
  "gpt-4o-mini": {
    text: `Here are the key findings on quantum computing developments:

1. **Error Correction**: IBM achieved 10x improvement in error correction codes.
2. **Scalability**: Google reached 70 qubits with better coherence times.
3. **Applications**: Quantum advantage demonstrated in optimization and drug discovery.
4. **Hardware**: Multiple architectures (superconducting, trapped-ion, photonic) are competitive.

Commercial viability for specific use cases is expected by 2028.`,
    tokens: 89,
    latency: 890,
    cost: "$0.0012",
  },
  "claude-3-opus": {
    text: `The quantum computing landscape has seen remarkable progress across several fronts:

**Error Correction**
IBM's latest research demonstrates a novel error correction code achieving a 10x reduction in logical error rates. This represents a significant step toward fault-tolerant quantum computing, which is widely considered the threshold for practical quantum computation.

**Scale and Performance**
Google's newest quantum processor operates at 70 qubits with substantially improved coherence times. Industry roadmaps now project 1000+ qubit systems within a 3-5 year horizon, though maintaining quality at scale remains the critical challenge.

**Real-World Impact**
The transition from theoretical to practical is accelerating. Companies have demonstrated genuine quantum advantage in:
- Supply chain optimization
- Molecular simulation for drug discovery
- Financial portfolio optimization

**Architectural Diversity**
The competitive landscape is broadening beyond superconducting qubits, with trapped-ion (IonQ) and photonic (Xanadu) approaches showing compelling results.

Commercial quantum computing for targeted applications appears on track for 2028, though general-purpose quantum computing remains a longer-term goal.`,
    tokens: 213,
    latency: 3120,
    cost: "$0.0180",
  },
  "claude-3-sonnet": {
    text: `Here's a summary of the latest quantum computing developments:

**Key Breakthroughs:**
- IBM's new error correction code achieves 10x reduction in logical error rates
- Google's 70-qubit processor shows improved coherence times

**Scalability:**
Industry experts project 1000+ qubit systems within 3-5 years. The main bottleneck remains maintaining qubit quality at scale.

**Practical Applications:**
Quantum advantage has been demonstrated in supply chain optimization, drug discovery, and financial modeling. These represent the first commercially viable use cases.

**Ecosystem Growth:**
Multiple hardware approaches are now viable — superconducting (IBM, Google), trapped-ion (IonQ), and photonic (Xanadu) systems are all competitive.

Expected commercial viability for targeted applications: 2028.`,
    tokens: 145,
    latency: 1780,
    cost: "$0.0058",
  },
};

// Default fallback for models without specific mock data
const defaultMockResponse = {
  text: `Based on current developments in quantum computing:

**Key Highlights:**
- Error correction rates improving by order of magnitude
- Qubit counts reaching 70+ with improved stability
- Practical applications emerging in optimization and simulation
- Multiple hardware architectures proving competitive

The field continues to advance toward commercial viability, with targeted applications expected by 2028.`,
  tokens: 72,
  latency: 1200,
  cost: "$0.0035",
};

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
              className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)] text-[var(--text-secondary)] text-xs max-w-[200px]"
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
  output,
  isStreaming,
  onCopy,
  copied,
}: {
  modelId: string;
  output: OutputData | null;
  isStreaming: boolean;
  onCopy: (text: string) => void;
  copied: string | null;
}) {
  const modelConfig = MODELS.find((m) => m.id === modelId);
  const isComplete = output && output.displayedText.length >= output.text.length;

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#12121e] overflow-hidden flex flex-col h-full">
      {/* Output header */}
      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {modelConfig && (
            <ProviderIcon provider={modelConfig.provider} color={modelConfig.providerColor} />
          )}
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {modelConfig?.name || modelId}
          </span>
          {isStreaming && !isComplete && (
            <Badge className="bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20 text-[10px] px-1.5 py-0 h-4">
              Streaming
            </Badge>
          )}
          {isComplete && (
            <Badge className="bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20 text-[10px] px-1.5 py-0 h-4">
              Complete
            </Badge>
          )}
        </div>
        {output && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <Hash className="w-3 h-3" />
              <span className="tabular-nums">{output.tokens}</span>
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
            <Separator orientation="vertical" className="h-3 bg-[rgba(255,255,255,0.06)]" />
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
        {output ? (
          <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
            {output.displayedText}
            {!isComplete && (
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

// --- Main Page Component ---
export default function PlaygroundPage() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [prompt, setPrompt] = useState(
    "Summarize the latest developments in quantum computing. Focus on key breakthroughs, scalability progress, and practical applications."
  );
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI assistant. Provide clear, well-structured responses with concrete examples when possible."
  );
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [model, setModel] = useState("gpt-4o");
  const [compareModelA, setCompareModelA] = useState("gpt-4o");
  const [compareModelB, setCompareModelB] = useState("claude-3-opus");

  // Parameters
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [topP, setTopP] = useState(1.0);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.0);
  const [presencePenalty, setPresencePenalty] = useState(0.0);

  // State
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<Record<string, OutputData>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      id: "h1",
      prompt: "Explain transformer architecture in simple terms",
      model: "gpt-4o",
      timestamp: new Date(Date.now() - 3600000),
      tokens: 245,
      latency: 2100,
      cost: "$0.012",
    },
    {
      id: "h2",
      prompt: "Write a Python function that implements binary search",
      model: "claude-3-opus",
      timestamp: new Date(Date.now() - 7200000),
      tokens: 178,
      latency: 1890,
      cost: "$0.015",
    },
    {
      id: "h3",
      prompt: "Compare REST vs GraphQL for a mobile app backend",
      model: "gpt-4o-mini",
      timestamp: new Date(Date.now() - 14400000),
      tokens: 312,
      latency: 1250,
      cost: "$0.004",
    },
    {
      id: "h4",
      prompt: "Summarize the latest developments in quantum computing",
      model: "gpt-4o",
      timestamp: new Date(Date.now() - 86400000),
      tokens: 187,
      latency: 2340,
      cost: "$0.009",
    },
  ]);

  const intervalRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup intervals on unmount
  useEffect(() => {
    const refs = intervalRefs.current;
    return () => {
      Object.values(refs).forEach(clearInterval);
    };
  }, []);

  const simulateStream = useCallback(
    (modelKey: string, response: { text: string; tokens: number; latency: number; cost: string }) => {
      let charIndex = 0;
      const fullText = response.text;

      setOutputs((prev) => ({
        ...prev,
        [modelKey]: {
          ...response,
          displayedText: "",
        },
      }));

      intervalRefs.current[modelKey] = setInterval(() => {
        charIndex += 3;
        if (charIndex >= fullText.length) {
          charIndex = fullText.length;
          clearInterval(intervalRefs.current[modelKey]);
        }
        setOutputs((prev) => ({
          ...prev,
          [modelKey]: {
            ...response,
            displayedText: fullText.slice(0, charIndex),
          },
        }));
      }, 12);
    },
    []
  );

  const handleRun = useCallback(() => {
    if (!prompt.trim() || running) return;

    setRunning(true);
    setOutputs({});

    // Clear any existing intervals
    Object.values(intervalRefs.current).forEach(clearInterval);

    if (mode === "compare") {
      const modelsToRun = [compareModelA, compareModelB];
      modelsToRun.forEach((m, i) => {
        setTimeout(() => {
          simulateStream(m, mockResponses[m] || defaultMockResponse);
        }, i * 300);
      });

      // Add to history
      const resp = mockResponses[compareModelA] || defaultMockResponse;
      setHistory((prev) => [
        {
          id: `h${Date.now()}`,
          prompt: prompt.slice(0, 100),
          model: `${compareModelA} vs ${compareModelB}`,
          timestamp: new Date(),
          tokens: resp.tokens,
          latency: resp.latency,
          cost: resp.cost,
        },
        ...prev,
      ]);

      setTimeout(() => setRunning(false), 1800);
    } else {
      const response = mockResponses[model] || defaultMockResponse;
      simulateStream(model, response);

      setHistory((prev) => [
        {
          id: `h${Date.now()}`,
          prompt: prompt.slice(0, 100),
          model,
          timestamp: new Date(),
          tokens: response.tokens,
          latency: response.latency,
          cost: response.cost,
        },
        ...prev,
      ]);

      setTimeout(() => setRunning(false), 800);
    }
  }, [prompt, running, mode, model, compareModelA, compareModelB, simulateStream]);

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
                className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)] text-xs"
              >
                {historyOpen ? "Hide history" : "Show history"}
              </TooltipContent>
            </Tooltip>
            <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.06)] bg-[var(--bg-hover)] text-[10px] text-[var(--text-tertiary)]">
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

        {!loading && (
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
                  <TabsList className="bg-[#12121e] border border-[rgba(255,255,255,0.06)] h-9">
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

                {/* Content area — flexible layout */}
                <div className="flex-1 flex gap-4 min-h-0">
                  {/* Left column: System prompt + Prompt + Output */}
                  <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
                    {/* System Prompt (collapsible) */}
                    <motion.div
                      className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#12121e] overflow-hidden shrink-0"
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
                                className="w-full rounded-lg border border-[rgba(255,255,255,0.06)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] resize-none outline-none focus:border-[var(--accent-blue)]/50 transition-colors placeholder:text-[var(--text-tertiary)]"
                                placeholder="You are a helpful assistant..."
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* Model selector row */}
                    <TabsContent value="single" className="mt-0 shrink-0">
                      <div className="flex items-center gap-3">
                        <Select value={model} onValueChange={setModel}>
                          <SelectTrigger className="w-[260px] h-9 bg-[#12121e] border-[rgba(255,255,255,0.06)] text-sm">
                            <SelectValue>
                              <span className="flex items-center gap-2">
                                <ProviderIcon
                                  provider={MODELS.find((m) => m.id === model)?.provider || ""}
                                  color={MODELS.find((m) => m.id === model)?.providerColor || "#666"}
                                />
                                <span className="text-[var(--text-primary)]">
                                  {MODELS.find((m) => m.id === model)?.name || model}
                                </span>
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)]">
                            {["OpenAI", "Anthropic", "Google", "Mistral", "Meta"].map((provider) => {
                              const providerModels = MODELS.filter((m) => m.provider === provider);
                              if (providerModels.length === 0) return null;
                              return (
                                <SelectGroup key={provider}>
                                  <SelectLabel className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] pl-3 py-1">
                                    {provider}
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
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    <TabsContent value="compare" className="mt-0 shrink-0">
                      <div className="flex items-center gap-3">
                        <Select value={compareModelA} onValueChange={setCompareModelA}>
                          <SelectTrigger className="flex-1 h-9 bg-[#12121e] border-[rgba(255,255,255,0.06)] text-sm">
                            <SelectValue>
                              <span className="flex items-center gap-2">
                                <ProviderIcon
                                  provider={MODELS.find((m) => m.id === compareModelA)?.provider || ""}
                                  color={MODELS.find((m) => m.id === compareModelA)?.providerColor || "#666"}
                                />
                                <span className="text-[var(--text-primary)] text-xs">
                                  {MODELS.find((m) => m.id === compareModelA)?.name || compareModelA}
                                </span>
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)]">
                            {MODELS.map((m) => (
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
                          <SelectTrigger className="flex-1 h-9 bg-[#12121e] border-[rgba(255,255,255,0.06)] text-sm">
                            <SelectValue>
                              <span className="flex items-center gap-2">
                                <ProviderIcon
                                  provider={MODELS.find((m) => m.id === compareModelB)?.provider || ""}
                                  color={MODELS.find((m) => m.id === compareModelB)?.providerColor || "#666"}
                                />
                                <span className="text-[var(--text-primary)] text-xs">
                                  {MODELS.find((m) => m.id === compareModelB)?.name || compareModelB}
                                </span>
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)]">
                            {MODELS.map((m) => (
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
                    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#12121e] overflow-hidden shrink-0">
                      <div className="px-4 py-2.5 border-b border-[rgba(255,255,255,0.04)] flex items-center justify-between">
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
                          output={outputs[compareModelA] || null}
                          isStreaming={running}
                          onCopy={(text) => handleCopy(text, compareModelA)}
                          copied={copied}
                        />
                        <OutputPanel
                          modelId={compareModelB}
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
                    <div className="w-full rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#12121e] p-4 space-y-5 h-fit">
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
                                setFrequencyPenalty(0.0);
                                setPresencePenalty(0.0);
                              }}
                              className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)] text-xs"
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
                                className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)] text-[var(--text-secondary)] text-xs max-w-[200px]"
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
                          className="w-full h-8 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[var(--bg-primary)] px-3 text-xs font-mono text-[var(--accent-blue)] outline-none focus:border-[var(--accent-blue)]/50 transition-colors tabular-nums"
                        />
                      </div>

                      <Separator className="bg-[rgba(255,255,255,0.04)]" />

                      <ParamSlider
                        label="Top P"
                        value={topP}
                        min={0}
                        max={1}
                        step={0.1}
                        onChange={setTopP}
                        tooltip="Nucleus sampling. Controls diversity via cumulative probability cutoff."
                      />

                      <ParamSlider
                        label="Freq. Penalty"
                        value={frequencyPenalty}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={setFrequencyPenalty}
                        tooltip="Penalizes tokens based on how often they appear. Reduces repetition."
                      />

                      <ParamSlider
                        label="Pres. Penalty"
                        value={presencePenalty}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={setPresencePenalty}
                        tooltip="Penalizes tokens based on whether they appear at all. Encourages new topics."
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
                  <div className="w-[260px] h-full rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#12121e] flex flex-col">
                    <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.04)] flex items-center justify-between shrink-0">
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
                            className="bg-[#1a1a2e] border-[rgba(255,255,255,0.1)] text-xs"
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
                            const entryModel = MODELS.find((m) => m.id === entry.model);
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
