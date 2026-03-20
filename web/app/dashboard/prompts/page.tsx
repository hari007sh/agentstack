"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FileText,
  Plus,
  Search,
  Tag,
  Clock,
} from "lucide-react";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- Mock Data ---
interface Prompt {
  id: string;
  slug: string;
  name: string;
  description: string;
  active_version: number;
  total_versions: number;
  model: string;
  tags: string[];
  updated_at: string;
}

const mockPrompts: Prompt[] = [
  {
    id: "prompt_001",
    slug: "research-summarizer",
    name: "Research Summarizer",
    description: "Summarizes academic papers and extracts key findings with citations.",
    active_version: 3,
    total_versions: 3,
    model: "gpt-4o",
    tags: ["research", "summarization"],
    updated_at: "2026-03-19T14:30:00Z",
  },
  {
    id: "prompt_002",
    slug: "code-reviewer",
    name: "Code Review Assistant",
    description: "Reviews code for bugs, security issues, and best practice violations.",
    active_version: 5,
    total_versions: 5,
    model: "claude-3-opus",
    tags: ["code", "review", "quality"],
    updated_at: "2026-03-18T10:15:00Z",
  },
  {
    id: "prompt_003",
    slug: "support-agent-v2",
    name: "Customer Support Agent",
    description: "Handles customer queries with empathy and accuracy, escalating when needed.",
    active_version: 2,
    total_versions: 4,
    model: "gpt-4o-mini",
    tags: ["support", "customer"],
    updated_at: "2026-03-17T08:45:00Z",
  },
  {
    id: "prompt_004",
    slug: "data-extractor",
    name: "Structured Data Extractor",
    description: "Extracts structured JSON data from unstructured text documents.",
    active_version: 1,
    total_versions: 1,
    model: "gpt-4o",
    tags: ["extraction", "json"],
    updated_at: "2026-03-15T16:20:00Z",
  },
];

function formatTimeAgo(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Less than 1h ago";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "1 day ago";
  return `${diffD} days ago`;
}

export default function PromptsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Create form state
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newModel, setNewModel] = useState("gpt-4o");
  const [newTags, setNewTags] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const filteredPrompts = useMemo(() => {
    if (!search.trim()) return mockPrompts;
    const q = search.toLowerCase();
    return mockPrompts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [search]);

  const isEmpty = !loading && filteredPrompts.length === 0;

  const handleCreate = () => {
    // Simulate creation
    setDialogOpen(false);
    setNewSlug("");
    setNewName("");
    setNewDescription("");
    setNewBody("");
    setNewModel("gpt-4o");
    setNewTags("");
  };

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
          <h1 className="text-xl font-semibold">Prompts</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage, version, and test your prompt templates
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]">
              <Plus className="w-4 h-4" />
              Create Prompt
            </button>
          </DialogTrigger>
          <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Prompt</DialogTitle>
              <DialogDescription className="text-[var(--text-secondary)]">
                Create a new prompt template with versioning.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Slug
                  </label>
                  <Input
                    value={newSlug}
                    onChange={(e) =>
                      setNewSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "")
                      )
                    }
                    placeholder="my-prompt"
                    className="bg-[var(--bg-primary)] border-[var(--border-default)] font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Name
                  </label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="My Prompt"
                    className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Description
                </label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What does this prompt do?"
                  className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Body
                </label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder={"You are a helpful assistant.\n\nGiven {{input}}, produce {{output}}."}
                  rows={5}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm font-mono resize-none outline-none focus:border-[var(--accent-blue)] transition-colors placeholder:text-[var(--text-tertiary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Model
                  </label>
                  <Select value={newModel} onValueChange={setNewModel}>
                    <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
                      <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                      <SelectItem value="claude-3-opus">claude-3-opus</SelectItem>
                      <SelectItem value="claude-3-sonnet">claude-3-sonnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Tags
                  </label>
                  <Input
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="tag1, tag2"
                    className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                className="text-[var(--text-secondary)]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
              >
                Create Prompt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, slug, or tag..."
          className="pl-10 bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5"
            >
              <SkeletonBlock className="h-5 w-40 mb-2" />
              <SkeletonBlock className="h-3 w-24 mb-3" />
              <SkeletonBlock className="h-4 w-full mb-4" />
              <div className="flex gap-2">
                <SkeletonBlock className="h-5 w-16" />
                <SkeletonBlock className="h-5 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No prompts yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Create your first prompt template to start managing and versioning
            your prompts.
          </p>
        </div>
      )}

      {/* Cards Grid */}
      {!loading && filteredPrompts.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {filteredPrompts.map((prompt) => (
            <motion.div
              key={prompt.id}
              variants={staggerItem}
              onClick={() => router.push(`/dashboard/prompts/${prompt.id}`)}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--border-default)] transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-semibold">{prompt.name}</h3>
                <span className="flex-shrink-0 ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] font-medium">
                  v{prompt.active_version}
                </span>
              </div>

              <p className="text-xs font-mono text-[var(--text-tertiary)] mb-2">
                {prompt.slug}
              </p>

              <p className="text-xs text-[var(--text-secondary)] mb-4 line-clamp-2">
                {prompt.description}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Tag className="w-3 h-3 text-[var(--text-tertiary)]" />
                  {prompt.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(prompt.updated_at)}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
