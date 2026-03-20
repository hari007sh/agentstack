"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Upload,
  Download,
  Link2,
  Database,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonBlock, SkeletonTable } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface DatasetItem {
  id: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

interface ListItemsResponse {
  items: DatasetItem[];
  total: number;
  limit: number;
  offset: number;
}

const formatColors: Record<string, string> = {
  json: "var(--accent-blue)",
  csv: "var(--accent-green)",
  jsonl: "var(--accent-purple)",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function DatasetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  // Items state
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const itemsPerPage = 20;
  const [page, setPage] = useState(1);

  // Add item dialog state
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemJson, setNewItemJson] = useState("{}");

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingFile, setImportingFile] = useState(false);

  // Delete item confirm state
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Delete dataset confirm state
  const [confirmDeleteDataset, setConfirmDeleteDataset] = useState(false);

  const initAuth = useCallback(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token");
      if (token) {
        api.setToken(token);
      }
    }
  }, []);

  const fetchDataset = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      initAuth();
      const res = await api.get<Dataset>(`/v1/datasets/${datasetId}`);
      setDataset(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        showApiError(err);
      } else {
        setError("Failed to load dataset");
        showError("Failed to load dataset");
      }
    } finally {
      setLoading(false);
    }
  }, [datasetId, initAuth]);

  const fetchItems = useCallback(async (pageNum: number) => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      initAuth();
      const offset = (pageNum - 1) * itemsPerPage;
      const res = await api.get<ListItemsResponse>(
        `/v1/datasets/${datasetId}/items?limit=${itemsPerPage}&offset=${offset}`
      );
      setItems(res.items || []);
      setItemsTotal(res.total || 0);
    } catch (err) {
      if (err instanceof ApiError) {
        setItemsError(err.message);
      } else {
        setItemsError("Failed to load items");
      }
    } finally {
      setItemsLoading(false);
    }
  }, [datasetId, initAuth, itemsPerPage]);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  useEffect(() => {
    if (!loading && dataset) {
      fetchItems(page);
    }
  }, [loading, dataset, page, fetchItems]);

  const totalPages = Math.max(1, Math.ceil(itemsTotal / itemsPerPage));

  const handleAddItem = async () => {
    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(newItemJson);
    } catch {
      showError("Invalid JSON. Please enter valid JSON data.");
      return;
    }

    setAddingItem(true);
    try {
      initAuth();
      await api.post(`/v1/datasets/${datasetId}/items`, { data: parsedData });
      showSuccess("Item added successfully");
      setAddItemDialogOpen(false);
      setNewItemJson("{}");
      await fetchItems(page);
      await fetchDataset(); // Refresh item count
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to add item");
      }
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (deletingItemId === itemId) {
      // Confirm deletion
      try {
        initAuth();
        await api.delete(`/v1/datasets/${datasetId}/items/${itemId}`);
        showSuccess("Item deleted");
        setDeletingItemId(null);
        await fetchItems(page);
        await fetchDataset(); // Refresh item count
      } catch (err) {
        if (err instanceof ApiError) {
          showApiError(err);
        } else {
          showError("Failed to delete item");
        }
        setDeletingItemId(null);
      }
    } else {
      setDeletingItemId(itemId);
      setTimeout(() => setDeletingItemId(null), 3000);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingFile(true);
    try {
      initAuth();
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/v1/datasets/${datasetId}/import`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({
          error: { message: res.statusText },
        }));
        throw new Error(errorBody.error?.message || "Import failed");
      }

      showSuccess("File imported successfully");
      await fetchItems(page);
      await fetchDataset(); // Refresh item count
    } catch (err) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError("Failed to import file");
      }
    } finally {
      setImportingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleExport = async () => {
    try {
      initAuth();
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/v1/datasets/${datasetId}/export`, {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({
          error: { message: res.statusText },
        }));
        throw new Error(errorBody.error?.message || "Export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dataset?.name || "dataset"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showSuccess("Dataset exported");
    } catch (err) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError("Failed to export dataset");
      }
    }
  };

  const handleDeleteDataset = async () => {
    try {
      initAuth();
      await api.delete(`/v1/datasets/${datasetId}`);
      showSuccess("Dataset deleted");
      router.push("/dashboard/datasets");
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to delete dataset");
      }
      setConfirmDeleteDataset(false);
    }
  };

  // Extract display columns from items data
  const getItemColumns = (): string[] => {
    if (items.length === 0) return [];
    const columnSet = new Set<string>();
    for (const item of items) {
      const data = item.data || item;
      for (const key of Object.keys(data)) {
        if (key !== "id") {
          columnSet.add(key);
        }
      }
    }
    return Array.from(columnSet).slice(0, 4); // Show max 4 columns
  };

  const getItemValue = (item: DatasetItem, col: string): string => {
    const data = item.data || item;
    const val = (data as Record<string, unknown>)[col];
    if (val === null || val === undefined) return "—";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const itemColumns = getItemColumns();
  const hasItems = !itemsLoading && items.length > 0;
  const itemsEmpty = !itemsLoading && !itemsError && items.length === 0 && !loading;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Back Navigation */}
      <button
        onClick={() => router.push("/dashboard/datasets")}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Datasets
      </button>

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <SkeletonBlock className="h-6 w-48 mb-2" />
            <SkeletonBlock className="h-4 w-96 mb-4" />
            <div className="flex gap-3">
              <SkeletonBlock className="h-5 w-24" />
              <SkeletonBlock className="h-5 w-20" />
            </div>
          </div>
          <SkeletonTable rows={5} cols={3} />
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--accent-red)] flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--accent-red)]">
                Failed to load dataset
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {error}
              </p>
            </div>
            <button
              onClick={fetchDataset}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && dataset && (
        <>
          {/* Dataset Header */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-lg font-semibold">{dataset.name}</h1>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium font-mono uppercase"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${formatColors[dataset.format] || "var(--text-tertiary)"} 12%, transparent)`,
                      color: formatColors[dataset.format] || "var(--text-tertiary)",
                    }}
                  >
                    {dataset.format}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  {dataset.description || "No description"}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-tertiary)]">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    {(dataset.item_count || 0)} items
                  </span>
                  {dataset.linked_suites && dataset.linked_suites.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" />
                      {dataset.linked_suites.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Hidden file input for import */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,.jsonl"
                  onChange={handleImport}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingFile}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {importingFile ? "Importing..." : "Import"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  onClick={handleExport}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--accent-red)]/30 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
                  onClick={() => setConfirmDeleteDataset(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Delete
                </Button>
              </div>
            </div>
          </div>

          {/* Items Error State */}
          {itemsError && (
            <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--accent-red)] flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--accent-red)]">
                    Failed to load items
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {itemsError}
                  </p>
                </div>
                <button
                  onClick={() => fetchItems(page)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Items Loading */}
          {itemsLoading && <SkeletonTable rows={5} cols={3} />}

          {/* Empty State */}
          {itemsEmpty && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center mx-auto mb-4">
                <Database className="w-6 h-6 text-[var(--accent-purple)]" />
              </div>
              <h3 className="text-sm font-medium mb-1">No items yet</h3>
              <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
                Add items manually or import from a CSV/JSON file.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setAddItemDialogOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Import File
                </button>
              </div>
            </div>
          )}

          {/* Items Table */}
          {hasItems && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Items ({itemsTotal})
                </h3>
                <button
                  onClick={() => setAddItemDialogOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-white text-xs font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Item
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      {itemColumns.map((header) => (
                        <th
                          key={header}
                          className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                        >
                          {header}
                        </th>
                      ))}
                      <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium w-10">
                        {/* Actions */}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <motion.tr
                        key={item.id}
                        variants={staggerItem}
                        className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        {itemColumns.map((col) => (
                          <td
                            key={col}
                            className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-xs"
                          >
                            <p className="line-clamp-2">
                              {getItemValue(item, col)}
                            </p>
                          </td>
                        ))}
                        <td className="px-5 py-3">
                          <button
                            onClick={(e) => handleDeleteItem(e, item.id)}
                            className={`p-1.5 rounded transition-colors ${
                              deletingItemId === item.id
                                ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)]"
                                : "hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-red)]"
                            }`}
                            title={
                              deletingItemId === item.id
                                ? "Click again to confirm delete"
                                : "Delete item"
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-tertiary)]">
                  Showing {(page - 1) * itemsPerPage + 1}–
                  {Math.min(page * itemsPerPage, itemsTotal)} of{" "}
                  {itemsTotal} items
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                    // Show pages around current page
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                          page === pageNum
                            ? "bg-[var(--accent-blue)] text-white"
                            : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Add Item Dialog */}
          <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
            <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Item</DialogTitle>
                <DialogDescription className="text-[var(--text-secondary)]">
                  Add a new data item to this dataset. Enter the data as JSON.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Data (JSON)
                  </label>
                  <textarea
                    value={newItemJson}
                    onChange={(e) => setNewItemJson(e.target.value)}
                    placeholder='{"input": "...", "expected_output": "..."}'
                    rows={8}
                    className="w-full rounded-md bg-[var(--bg-primary)] border border-[var(--border-default)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent resize-y"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setAddItemDialogOpen(false)}
                  className="text-[var(--text-secondary)]"
                  disabled={addingItem}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddItem}
                  disabled={addingItem}
                  className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
                >
                  {addingItem ? "Adding..." : "Add Item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Dataset Confirmation Dialog */}
          <Dialog open={confirmDeleteDataset} onOpenChange={setConfirmDeleteDataset}>
            <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete Dataset</DialogTitle>
                <DialogDescription className="text-[var(--text-secondary)]">
                  Are you sure you want to delete &ldquo;{dataset.name}&rdquo;? This action
                  cannot be undone and will remove all {dataset.item_count || 0} items.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDeleteDataset(false)}
                  className="text-[var(--text-secondary)]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteDataset}
                  className="bg-[var(--accent-red)] text-white hover:bg-[var(--accent-red)]/90"
                >
                  Delete Dataset
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </motion.div>
  );
}
