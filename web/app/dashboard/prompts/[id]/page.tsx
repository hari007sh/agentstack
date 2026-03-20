"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Play,
  Variable,
  Rocket,
  AlertTriangle,
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
import { api, ApiError } from "@/lib/api";
import { showSuccess, showError, showApiError } from "@/lib/toast";

// --- Types matching backend responses ---
interface PromptDetail {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string;
  active_version: number;
  tags: string[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  active_body?: string;
  active_system_prompt?: string;
  active_model?: string;
  active_variables?: unknown;
  active_config?: unknown;
}

interface BackendVersion {
  id: string;
  prompt_id: string;
  org_id: string;
  version: number;
  body: string;
  model: string;
  variables: unknown;
  system_prompt: string;
  config: unknown;
  change_note: string;
  created_by: string;
  created_at: string;
}

interface VersionsListResponse {
  data: BackendVersion[];
  meta: { total: number };
}

export default function PromptDetailPage() {
  const router = useRouter();
  const params = useParams();
  const promptId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptDetail | null>(null);
  const [versions, setVersions] = useState<BackendVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState<number | null>(null);

  const fetchPromptAndVersions = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (token) api.setToken(token);

      const [promptRes, versionsRes] = await Promise.all([
        api.get<PromptDetail>(`/v1/prompts/${promptId}`),
        api.get<VersionsListResponse>(`/v1/prompts/${promptId}/versions`),
      ]);

      setPrompt(promptRes);

      // Sort versions descending (newest first)
      const sorted = (versionsRes.data || []).sort(
        (a, b) => b.version - a.version
      );
      setVersions(sorted);

      // Select the active version by default
      const activeV = promptRes.active_version;
      setSelectedVersion(activeV);

      // Set the editor to the active version body
      const activeVersionData = sorted.find((v) => v.version === activeV);
      if (activeVersionData) {
        setEditedBody(activeVersionData.body);
      }

      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
        setError(err.message);
      } else {
        setError("Failed to load prompt");
        showError("Failed to load prompt");
      }
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    fetchPromptAndVersions();
  }, [fetchPromptAndVersions]);

  // When user selects a different version, update editor body
  useEffect(() => {
    if (selectedVersion !== null) {
      const versionData = versions.find((v) => v.version === selectedVersion);
      if (versionData) {
        setEditedBody(versionData.body);
      }
    }
  }, [selectedVersion, versions]);

  const variables = extractVariables(editedBody);

  // Map backend versions to the VersionHistory component's PromptVersion interface
  const versionHistoryItems: (PromptVersion & { body: string })[] =
    versions.map((v) => ({
      version: v.version,
      body: v.body,
      change_note: v.change_note || "No change note",
      created_at: v.created_at,
      is_active: prompt ? v.version === prompt.active_version : false,
      author: v.created_by || "Unknown",
    }));

  const handleSaveVersion = async () => {
    if (!changeNote.trim()) {
      showError("Please describe what changed");
      return;
    }
    if (!editedBody.trim()) {
      showError("Prompt body cannot be empty");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (token) api.setToken(token);

      // Find the model from the currently selected version (or fallback to active_model)
      const currentVersionData = versions.find(
        (v) => v.version === selectedVersion
      );
      const model = currentVersionData?.model || prompt?.active_model || "";
      const systemPrompt =
        currentVersionData?.system_prompt ||
        prompt?.active_system_prompt ||
        "";

      await api.post(`/v1/prompts/${promptId}/versions`, {
        body: editedBody,
        model,
        system_prompt: systemPrompt,
        change_note: changeNote,
      });

      showSuccess("New version saved");
      setChangeNote("");
      await fetchPromptAndVersions();
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to save version");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async (versionNum: number) => {
    setDeploying(versionNum);
    try {
      const token = localStorage.getItem("token");
      if (token) api.setToken(token);

      await api.post(`/v1/prompts/${promptId}/deploy/${versionNum}`);
      showSuccess(`Version ${versionNum} deployed`);
      await fetchPromptAndVersions();
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to deploy version");
      }
    } finally {
      setDeploying(null);
    }
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

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-red)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--accent-red)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">Failed to load prompt</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchPromptAndVersions();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && prompt && (
        <>
          {/* Prompt Header */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-lg font-semibold">{prompt.name}</h1>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] font-medium">
                    v{prompt.active_version}
                  </span>
                </div>
                <p className="text-xs font-mono text-[var(--text-tertiary)] mb-2">
                  {prompt.slug}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {prompt.description}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {prompt.tags &&
                    prompt.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
                      >
                        {tag}
                      </Badge>
                    ))}
                  {prompt.active_model && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--accent-blue)]"
                    >
                      {prompt.active_model}
                    </Badge>
                  )}
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

              {/* Deploy selected version (if not already active) */}
              {selectedVersion !== null &&
                prompt &&
                selectedVersion !== prompt.active_version && (
                  <motion.div
                    variants={staggerItem}
                    className="rounded-xl border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--accent-amber)] mb-1">
                          This version is not active
                        </h3>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          Deploy v{selectedVersion} to make it the active
                          version.
                        </p>
                      </div>
                      <Button
                        onClick={() => handleDeploy(selectedVersion)}
                        disabled={deploying === selectedVersion}
                        size="sm"
                        className="bg-[var(--accent-amber)] text-black hover:bg-[var(--accent-amber)]/90 flex-shrink-0"
                      >
                        {deploying === selectedVersion ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            Deploying...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Rocket className="w-3.5 h-3.5" />
                            Deploy v{selectedVersion}
                          </span>
                        )}
                      </Button>
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
                  versions={versionHistoryItems}
                  selectedVersion={selectedVersion ?? undefined}
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
