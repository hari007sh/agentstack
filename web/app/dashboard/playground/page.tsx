"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Timer,
  Coins,
  Hash,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
};

export default function PlaygroundPage() {
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState(
    "Summarize the latest developments in quantum computing. Focus on key breakthroughs, scalability progress, and practical applications."
  );
  const [model, setModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [compareMode, setCompareMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<
    Record<string, { text: string; tokens: number; latency: number; cost: string; displayedText: string }>
  >({});

  const intervalRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
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
      }, 15);
    },
    []
  );

  const handleRun = () => {
    setRunning(true);
    setOutputs({});

    // Clear any existing intervals
    Object.values(intervalRefs.current).forEach(clearInterval);

    if (compareMode) {
      const models = ["gpt-4o", "gpt-4o-mini", "claude-3-opus"];
      // Stagger the starts slightly
      models.forEach((m, i) => {
        setTimeout(() => {
          simulateStream(m, mockResponses[m]);
        }, i * 200);
      });
      setTimeout(() => setRunning(false), 1500);
    } else {
      simulateStream(model, mockResponses[model] || mockResponses["gpt-4o"]);
      setTimeout(() => setRunning(false), 800);
    }
  };

  const activeModels = compareMode
    ? ["gpt-4o", "gpt-4o-mini", "claude-3-opus"]
    : [model];

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
          <h1 className="text-xl font-semibold">Playground</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Test and compare prompt outputs across models
          </p>
        </div>
        <button
          onClick={() => setCompareMode(!compareMode)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          {compareMode ? (
            <ToggleRight className="w-4 h-4 text-[var(--accent-blue)]" />
          ) : (
            <ToggleLeft className="w-4 h-4" />
          )}
          Compare Models
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <SkeletonBlock className="h-[200px] w-full rounded-xl" />
            <SkeletonBlock className="h-[120px] w-full rounded-xl" />
          </div>
          <SkeletonBlock className="h-[340px] w-full rounded-xl" />
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Editor + Controls */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {/* Editor */}
            <motion.div
              variants={staggerItem}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                Prompt
              </h2>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-3 text-sm font-mono resize-none outline-none focus:border-[var(--accent-blue)] transition-colors placeholder:text-[var(--text-tertiary)]"
                placeholder="Enter your prompt..."
              />
            </motion.div>

            {/* Controls */}
            <motion.div
              variants={staggerItem}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                Parameters
              </h2>
              <div className="space-y-4">
                {/* Model selector */}
                {!compareMode && (
                  <div className="space-y-2">
                    <label className="text-xs text-[var(--text-secondary)]">
                      Model
                    </label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
                        <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                        <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                        <SelectItem value="claude-3-opus">
                          claude-3-opus
                        </SelectItem>
                        <SelectItem value="claude-3-sonnet">
                          claude-3-sonnet
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Temperature */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[var(--text-secondary)]">
                      Temperature
                    </label>
                    <span className="text-xs font-mono text-[var(--text-tertiary)]">
                      {temperature.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[var(--bg-hover)] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-blue)]"
                  />
                </div>

                {/* Max Tokens */}
                <div className="space-y-2">
                  <label className="text-xs text-[var(--text-secondary)]">
                    Max Tokens
                  </label>
                  <Input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
                    min={1}
                    max={4096}
                    className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                  />
                </div>
              </div>
            </motion.div>

            {/* Run Button */}
            <motion.div variants={staggerItem}>
              <Button
                onClick={handleRun}
                disabled={running || !prompt.trim()}
                className="w-full bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 h-11"
              >
                {running ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Run
                  </span>
                )}
              </Button>
            </motion.div>
          </motion.div>

          {/* Right: Output */}
          <div
            className={cn(
              "space-y-4",
              compareMode && "lg:col-span-1"
            )}
          >
            {activeModels.map((m) => {
              const output = outputs[m];
              return (
                <div
                  key={m}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
                >
                  {/* Output header */}
                  <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {compareMode ? m : "Output"}
                    </span>
                    {output && (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                          <Hash className="w-3 h-3" />
                          {output.tokens} tokens
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                          <Timer className="w-3 h-3" />
                          {output.latency}ms
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                          <Coins className="w-3 h-3" />
                          {output.cost}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Output body */}
                  <div className="p-4 min-h-[200px]">
                    {output ? (
                      <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                        {output.displayedText}
                        {output.displayedText.length < output.text.length && (
                          <span className="inline-block w-2 h-4 bg-[var(--accent-blue)] ml-0.5 animate-pulse" />
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[200px] text-sm text-[var(--text-tertiary)]">
                        Run a prompt to see output here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

