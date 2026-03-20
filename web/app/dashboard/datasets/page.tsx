"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Database,
  Plus,
  Upload,
  Link2,
} from "lucide-react";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonTable } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
interface Dataset {
  id: string;
  name: string;
  description: string;
  item_count: number;
  format: "json" | "csv" | "jsonl";
  linked_suites: string[];
  created_at: string;
  updated_at: string;
}

const mockDatasets: Dataset[] = [
  {
    id: "ds_001",
    name: "Research Queries",
    description: "Collection of academic research queries with expected summarization outputs.",
    item_count: 150,
    format: "json",
    linked_suites: ["Research Agent Quality", "Citation Accuracy"],
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-03-18T14:30:00Z",
  },
  {
    id: "ds_002",
    name: "Code Review Samples",
    description: "Sample code snippets with expected review feedback and severity ratings.",
    item_count: 85,
    format: "jsonl",
    linked_suites: ["Code Review Accuracy"],
    created_at: "2026-03-01T08:00:00Z",
    updated_at: "2026-03-15T16:20:00Z",
  },
  {
    id: "ds_003",
    name: "Support Tickets",
    description: "Real anonymized support tickets with ideal agent responses and resolution tags.",
    item_count: 320,
    format: "csv",
    linked_suites: [],
    created_at: "2026-03-10T12:00:00Z",
    updated_at: "2026-03-19T09:45:00Z",
  },
];

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const formatColors: Record<string, string> = {
  json: "var(--accent-blue)",
  csv: "var(--accent-green)",
  jsonl: "var(--accent-purple)",
};

export default function DatasetsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFormat, setNewFormat] = useState("json");

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockDatasets.length === 0;

  const handleCreate = () => {
    setDialogOpen(false);
    setNewName("");
    setNewDescription("");
    setNewFormat("json");
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
          <h1 className="text-xl font-semibold">Datasets</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage evaluation datasets for testing your agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
            <Upload className="w-4 h-4" />
            Import
          </button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]">
                <Plus className="w-4 h-4" />
                Create Dataset
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] max-w-md">
              <DialogHeader>
                <DialogTitle>Create Dataset</DialogTitle>
                <DialogDescription className="text-[var(--text-secondary)]">
                  Create a new evaluation dataset.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Name
                  </label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="My Dataset"
                    className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Description
                  </label>
                  <Input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="What is this dataset for?"
                    className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Format
                  </label>
                  <Select value={newFormat} onValueChange={setNewFormat}>
                    <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="jsonl">JSONL</SelectItem>
                    </SelectContent>
                  </Select>
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
                  Create Dataset
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Loading */}
      {loading && <SkeletonTable rows={3} cols={5} />}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center mx-auto mb-4">
            <Database className="w-6 h-6 text-[var(--accent-purple)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No datasets yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Create or import a dataset to start building evaluation test suites.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && mockDatasets.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {["Name", "Items", "Format", "Linked Suites", "Last Updated"].map(
                    (header) => (
                      <th
                        key={header}
                        className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {mockDatasets.map((ds) => {
                  const fmtColor = formatColors[ds.format] || "var(--text-tertiary)";
                  return (
                    <motion.tr
                      key={ds.id}
                      variants={staggerItem}
                      onClick={() =>
                        router.push(`/dashboard/datasets/${ds.id}`)
                      }
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-sm font-medium">{ds.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-1">
                            {ds.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {ds.item_count.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium font-mono uppercase"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${fmtColor} 12%, transparent)`,
                            color: fmtColor,
                          }}
                        >
                          {ds.format}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {ds.linked_suites.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {ds.linked_suites.map((suite) => (
                              <div
                                key={suite}
                                className="flex items-center gap-1 text-xs text-[var(--text-secondary)]"
                              >
                                <Link2 className="w-3 h-3 text-[var(--text-tertiary)]" />
                                {suite}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-tertiary)]">
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-tertiary)]">
                        {formatDate(ds.updated_at)}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
