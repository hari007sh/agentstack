"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Database,
  Plus,
  Link2,
  AlertCircle,
  RefreshCw,
  Trash2,
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
import { api, ApiError } from "@/lib/api";
import { showSuccess, showError, showApiError } from "@/lib/toast";

// --- Types ---
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

interface ListDatasetsResponse {
  data: Dataset[];
  meta: { page: number; per_page: number; total: number };
  // Fallback shape from some endpoints
  datasets?: Dataset[];
  total?: number;
}

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
  const [error, setError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [total, setTotal] = useState(0);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFormat, setNewFormat] = useState("json");

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const initAuth = useCallback(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        api.setToken(token);
      }
    }
  }, []);

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      initAuth();
      const res = await api.get<ListDatasetsResponse>("/v1/datasets");
      setDatasets(res.data || res.datasets || []);
      setTotal(res.meta?.total ?? res.total ?? 0);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        showApiError(err);
      } else {
        setError("Failed to load datasets");
        showError("Failed to load datasets");
      }
    } finally {
      setLoading(false);
    }
  }, [initAuth]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      showError("Dataset name is required");
      return;
    }
    setCreating(true);
    try {
      initAuth();
      await api.post("/v1/datasets", {
        name: newName.trim(),
        description: newDescription.trim(),
        format: newFormat,
      });
      showSuccess("Dataset created successfully");
      setDialogOpen(false);
      setNewName("");
      setNewDescription("");
      setNewFormat("json");
      await fetchDatasets();
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to create dataset");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, datasetId: string) => {
    e.stopPropagation();
    if (deletingId === datasetId) {
      // Second click confirms deletion
      try {
        initAuth();
        await api.delete(`/v1/datasets/${datasetId}`);
        showSuccess("Dataset deleted");
        setDeletingId(null);
        await fetchDatasets();
      } catch (err) {
        if (err instanceof ApiError) {
          showApiError(err);
        } else {
          showError("Failed to delete dataset");
        }
        setDeletingId(null);
      }
    } else {
      // First click sets confirm state
      setDeletingId(datasetId);
      // Auto-reset after 3 seconds
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  const isEmpty = !loading && !error && datasets.length === 0;

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
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
                >
                  {creating ? "Creating..." : "Create Dataset"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Loading */}
      {loading && <SkeletonTable rows={3} cols={5} />}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--accent-red)] flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--accent-red)]">
                Failed to load datasets
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {error}
              </p>
            </div>
            <button
              onClick={fetchDatasets}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center mx-auto mb-4">
            <Database className="w-6 h-6 text-[var(--accent-purple)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No datasets yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            Create or import a dataset to start building evaluation test suites.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Create Your First Dataset
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && datasets.length > 0 && (
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
                  {["Name", "Items", "Format", "Linked Suites", "Last Updated", ""].map(
                    (header) => (
                      <th
                        key={header || "actions"}
                        className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {datasets.map((ds) => {
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
                        {(ds.item_count || 0).toLocaleString()}
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
                        {ds.linked_suites && ds.linked_suites.length > 0 ? (
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
                        {ds.updated_at ? formatDate(ds.updated_at) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={(e) => handleDelete(e, ds.id)}
                          className={`p-1.5 rounded transition-colors ${
                            deletingId === ds.id
                              ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)]"
                              : "hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-red)]"
                          }`}
                          title={deletingId === ds.id ? "Click again to confirm delete" : "Delete dataset"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total count footer */}
          {total > 0 && (
            <div className="px-5 py-3 border-t border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-tertiary)]">
                {total} dataset{total !== 1 ? "s" : ""} total
              </span>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
