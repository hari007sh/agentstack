"use client";

import React from "react";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showStack: boolean;
}

function formatErrorLog(component: string, error: Error): string {
  return `[AgentStack] ${new Date().toISOString()} ${component} ${error.name}: ${error.message}`;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showStack: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const componentName = errorInfo.componentStack
      ?.split("\n")
      .find((line) => line.trim().startsWith("at "))
      ?.trim()
      .replace(/^at\s+/, "")
      .split(" ")[0] ?? "Unknown";

    console.error(formatErrorLog(componentName, error));
    console.error("[AgentStack] Component stack:", errorInfo.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, showStack: false });
  };

  toggleStack = (): void => {
    this.setState((prev) => ({ showStack: !prev.showStack }));
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, showStack } = this.state;

      return <ErrorCard error={error} showStack={showStack} onToggleStack={this.toggleStack} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

interface ErrorCardProps {
  error: Error | null;
  showStack: boolean;
  onToggleStack: () => void;
  onRetry: () => void;
}

function ErrorCard({ error, showStack, onToggleStack, onRetry }: ErrorCardProps) {
  const issueUrl = `https://github.com/agentstack/agentstack/issues/new?title=${encodeURIComponent(
    `[Dashboard] ${error?.message ?? "Unknown error"}`
  )}&body=${encodeURIComponent(
    `## Error\n\n\`\`\`\n${error?.message ?? "Unknown"}\n\`\`\`\n\n## Stack Trace\n\n\`\`\`\n${error?.stack ?? "N/A"}\n\`\`\`\n\n## Steps to Reproduce\n\n1. \n`
  )}`;

  return (
    <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--bg-elevated)] p-6 max-w-2xl mx-auto my-8">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--accent-red)]/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-[var(--accent-red)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Something went wrong
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            An unexpected error occurred while rendering this page.
          </p>
        </div>
      </div>

      {/* Error message */}
      <div className="rounded-lg bg-[var(--accent-red)]/5 border border-[var(--accent-red)]/10 px-4 py-3 mb-4">
        <p className="text-sm font-mono text-[var(--accent-red)]">
          {error?.message ?? "An unknown error occurred"}
        </p>
      </div>

      {/* Stack trace (collapsible) */}
      {error?.stack && (
        <div className="mb-4">
          <button
            onClick={onToggleStack}
            className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {showStack ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {showStack ? "Hide" : "Show"} stack trace
          </button>
          {showStack && (
            <pre className="mt-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-4 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-h-64 overflow-y-auto">
              {error.stack}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="gap-1.5 border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </Button>
        <a
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Report Issue
          </Button>
        </a>
      </div>
    </div>
  );
}
