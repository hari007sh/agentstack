"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonBlock, SkeletonTable } from "@/components/skeleton";
import { Button } from "@/components/ui/button";

// --- Mock Data ---
const mockDataset = {
  id: "ds_001",
  name: "Research Queries",
  description:
    "Collection of academic research queries with expected summarization outputs for evaluating the Research Agent.",
  item_count: 150,
  format: "json" as const,
  linked_suites: ["Research Agent Quality", "Citation Accuracy"],
  created_at: "2026-02-20T10:00:00Z",
  updated_at: "2026-03-18T14:30:00Z",
};

interface DatasetItem {
  id: string;
  input: string;
  expected_output: string;
  context: string;
}

const mockItems: DatasetItem[] = [
  {
    id: "item_001",
    input: "Summarize recent advances in transformer architectures for NLP",
    expected_output:
      "Recent advances include sparse attention mechanisms, mixture-of-experts layers, and efficient fine-tuning techniques like LoRA and QLoRA.",
    context: "Focus on papers from 2024-2025. Include citation counts.",
  },
  {
    id: "item_002",
    input: "What are the key findings in CRISPR gene editing research?",
    expected_output:
      "Key findings include base editing, prime editing, and applications in sickle cell disease treatment with FDA approval.",
    context: "Medical and biological applications only.",
  },
  {
    id: "item_003",
    input: "Compare reinforcement learning approaches for robotics",
    expected_output:
      "Comparison should cover model-free vs model-based RL, sim-to-real transfer, and multi-task learning frameworks.",
    context: "Include both simulation and real-world results.",
  },
  {
    id: "item_004",
    input: "Explain the current state of quantum error correction",
    expected_output:
      "Cover surface codes, topological codes, and recent breakthroughs in logical qubit error rates from IBM and Google.",
    context: "Technical depth suitable for a physics graduate student.",
  },
  {
    id: "item_005",
    input: "Review federated learning privacy guarantees",
    expected_output:
      "Discuss differential privacy, secure aggregation, and known attack vectors like gradient inversion.",
    context: "Focus on practical deployments at scale.",
  },
  {
    id: "item_006",
    input: "Summarize graph neural network applications in drug discovery",
    expected_output:
      "Cover molecular property prediction, drug-target interaction, and generative molecular design using GNNs.",
    context: "Include benchmark datasets and state-of-the-art results.",
  },
  {
    id: "item_007",
    input: "What are the latest developments in autonomous vehicle perception?",
    expected_output:
      "Cover LiDAR-camera fusion, 3D object detection, and occupancy networks for robust scene understanding.",
    context: "Focus on commercial deployments and safety metrics.",
  },
  {
    id: "item_008",
    input: "Analyze trends in large language model scaling laws",
    expected_output:
      "Discuss Chinchilla scaling laws, compute-optimal training, and diminishing returns at extreme scales.",
    context: "Reference Kaplan et al. and Hoffmann et al.",
  },
  {
    id: "item_009",
    input: "Explain zero-knowledge proof systems for blockchain",
    expected_output:
      "Cover zk-SNARKs, zk-STARKs, and Plonk, with focus on throughput improvements and trusted setup elimination.",
    context: "Include Ethereum L2 applications.",
  },
  {
    id: "item_010",
    input: "Review multimodal AI model architectures",
    expected_output:
      "Discuss vision-language models (GPT-4V, Gemini), audio-language models, and unified multimodal frameworks.",
    context: "Focus on benchmark performance and emergent capabilities.",
  },
];

export default function DatasetDetailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const totalPages = Math.ceil(mockItems.length / itemsPerPage);
  const paginatedItems = mockItems.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const isEmpty = !loading && mockItems.length === 0;

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

      {!loading && (
        <>
          {/* Dataset Header */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-lg font-semibold">{mockDataset.name}</h1>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium font-mono uppercase"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-blue) 12%, transparent)",
                      color: "var(--accent-blue)",
                    }}
                  >
                    {mockDataset.format}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  {mockDataset.description}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-tertiary)]">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    {mockDataset.item_count} items
                  </span>
                  {mockDataset.linked_suites.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" />
                      {mockDataset.linked_suites.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--border-subtle)] text-[var(--text-secondary)]"
                >
                  <Link2 className="w-3.5 h-3.5 mr-1.5" />
                  Link to Test Suite
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--border-subtle)] text-[var(--text-secondary)]"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Import
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--border-subtle)] text-[var(--text-secondary)]"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export
                </Button>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {isEmpty && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center mx-auto mb-4">
                <Database className="w-6 h-6 text-[var(--accent-purple)]" />
              </div>
              <h3 className="text-sm font-medium mb-1">No items yet</h3>
              <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
                Add items manually or import from a CSV/JSON file.
              </p>
            </div>
          )}

          {/* Items Table */}
          {mockItems.length > 0 && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Items ({mockDataset.item_count})
                </h3>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-white text-xs font-medium hover:opacity-90 transition-opacity active:scale-[0.98]">
                  <Plus className="w-3.5 h-3.5" />
                  Add Item
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      {["Input", "Expected Output", "Context"].map(
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
                    {paginatedItems.map((item) => (
                      <motion.tr
                        key={item.id}
                        variants={staggerItem}
                        className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <td className="px-5 py-3 text-sm text-[var(--text-primary)] max-w-xs">
                          <p className="line-clamp-2">{item.input}</p>
                        </td>
                        <td className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-xs">
                          <p className="line-clamp-2">{item.expected_output}</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--text-tertiary)] max-w-xs">
                          <p className="line-clamp-2">{item.context}</p>
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
                  {Math.min(page * itemsPerPage, mockItems.length)} of{" "}
                  {mockItems.length} items
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                        page === i + 1
                          ? "bg-[var(--accent-blue)] text-white"
                          : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
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
        </>
      )}
    </motion.div>
  );
}
