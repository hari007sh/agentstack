"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Play,
  Variable,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PromptEditor,
  extractVariables,
} from "@/components/prompt/prompt-editor";
import {
  VersionHistory,
  type PromptVersion,
} from "@/components/prompt/version-history";

// --- Mock Data ---
const mockPrompt = {
  id: "prompt_001",
  slug: "research-summarizer",
  name: "Research Summarizer",
  description:
    "Summarizes academic papers and extracts key findings with citations.",
  model: "gpt-4o",
  tags: ["research", "summarization"],
};

const mockVersions: (PromptVersion & { body: string })[] = [
  {
    version: 3,
    body: `You are a research summarizer. Given a set of academic papers about {{topic}}, produce a comprehensive summary.

Requirements:
- Extract key findings from each paper
- Identify common themes across {{num_papers}} papers
- Highlight contradictions or debates in the field
- Include proper citations in {{citation_format}} format
- Keep the summary under {{max_words}} words

Focus on the following aspects: {{focus_areas}}

Output format:
1. Executive Summary
2. Key Findings
3. Methodology Comparison
4. Conclusions
5. References`,
    change_note: "Added citation format variable and focus areas section",
    created_at: "2026-03-19T14:30:00Z",
    is_active: true,
    author: "Jane Smith",
  },
  {
    version: 2,
    body: `You are a research summarizer. Given a set of academic papers about {{topic}}, produce a comprehensive summary.

Requirements:
- Extract key findings from each paper
- Identify common themes
- Include proper citations
- Keep the summary under {{max_words}} words`,
    change_note: "Added max_words variable for length control",
    created_at: "2026-03-15T10:00:00Z",
    is_active: false,
    author: "John Doe",
  },
  {
    version: 1,
    body: `You are a research summarizer. Given a set of academic papers about {{topic}}, produce a comprehensive summary.

Requirements:
- Extract key findings
- Identify common themes
- Include citations`,
    change_note: "Initial version of the research summarizer prompt",
    created_at: "2026-03-10T08:00:00Z",
    is_active: false,
    author: "John Doe",
  },
];

export default function PromptDetailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(3);
  const [editedBody, setEditedBody] = useState(mockVersions[0].body);
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const currentVersionData = mockVersions.find(
    (v) => v.version === selectedVersion
  );

  useEffect(() => {
    if (currentVersionData) {
      setEditedBody(currentVersionData.body);
    }
  }, [selectedVersion, currentVersionData]);

  const variables = extractVariables(editedBody);

  const handleSaveVersion = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setChangeNote("");
    }, 800);
  };

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Back Navigation */}
      <button
        onClick={() => router.push("/dashboard/prompts")}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Prompts
      </button>

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <SkeletonBlock className="h-6 w-48 mb-2" />
            <SkeletonBlock className="h-4 w-32 mb-3" />
            <SkeletonBlock className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <SkeletonBlock className="h-[300px] w-full rounded-xl" />
            </div>
            <div className="lg:col-span-2">
              <SkeletonBlock className="h-[300px] w-full rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Prompt Header */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-lg font-semibold">{mockPrompt.name}</h1>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] font-medium">
                    v{mockVersions.find((v) => v.is_active)?.version}
                  </span>
                </div>
                <p className="text-xs font-mono text-[var(--text-tertiary)] mb-2">
                  {mockPrompt.slug}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {mockPrompt.description}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {mockPrompt.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
                    >
                      {tag}
                    </Badge>
                  ))}
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--accent-blue)]"
                  >
                    {mockPrompt.model}
                  </Badge>
                </div>
              </div>
              <button
                onClick={() => router.push("/dashboard/playground")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
              >
                <Play className="w-4 h-4" />
                Open in Playground
              </button>
            </div>
          </div>

          {/* Split Layout: Editor + Version History */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Prompt Editor (60%) */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="lg:col-span-3 space-y-4"
            >
              <motion.div variants={staggerItem}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Prompt Editor</h2>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Viewing v{selectedVersion}
                  </span>
                </div>
                <PromptEditor value={editedBody} onChange={setEditedBody} />
              </motion.div>

              {/* Variables Panel */}
              {variables.length > 0 && (
                <motion.div
                  variants={staggerItem}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Variable className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Template Variables ({variables.length})
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {variables.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-cyan-400/10 text-cyan-400 border border-cyan-400/20"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Save New Version */}
              <motion.div
                variants={staggerItem}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                  Save New Version
                </h3>
                <div className="flex gap-3">
                  <Input
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    placeholder="Describe what changed..."
                    className="flex-1 bg-[var(--bg-primary)] border-[var(--border-default)]"
                  />
                  <Button
                    onClick={handleSaveVersion}
                    disabled={saving || !changeNote.trim()}
                    className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 flex-shrink-0"
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Save className="w-3.5 h-3.5" />
                        Save Version
                      </span>
                    )}
                  </Button>
                </div>
              </motion.div>
            </motion.div>

            {/* Right: Version History (40%) */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                <h2 className="text-sm font-semibold mb-4">Version History</h2>
                <VersionHistory
                  versions={mockVersions}
                  selectedVersion={selectedVersion}
                  onSelectVersion={setSelectedVersion}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
