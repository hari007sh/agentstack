"use client";

import { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
}

export function PromptEditor({
  value,
  onChange,
  readOnly = false,
  className,
  placeholder = "Write your prompt here...\nUse {{variable}} for template variables.",
}: PromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.max(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const lines = value.split("\n");
  const lineCount = lines.length;

  function renderHighlightedText(text: string) {
    const parts = text.split(/({{[^}]*}})/g);
    return parts.map((part, i) => {
      if (/^{{[^}]*}}$/.test(part)) {
        return (
          <span
            key={i}
            className="text-cyan-400 bg-cyan-400/10 rounded px-0.5"
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] overflow-hidden",
        className
      )}
    >
      <div className="flex">
        {/* Line numbers */}
        <div className="select-none flex-shrink-0 py-3 px-3 border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          {Array.from({ length: Math.max(lineCount, 8) }).map((_, i) => (
            <div
              key={i}
              className="text-[11px] font-mono text-[var(--text-tertiary)] leading-[1.625rem] text-right min-w-[1.5rem]"
            >
              {i < lineCount ? i + 1 : ""}
            </div>
          ))}
        </div>

        {/* Editor area */}
        <div className="relative flex-1 min-w-0">
          {/* Highlighted overlay */}
          <div
            ref={highlightRef}
            className="absolute inset-0 py-3 px-4 font-mono text-sm leading-[1.625rem] whitespace-pre-wrap break-words pointer-events-none overflow-hidden text-transparent"
            aria-hidden="true"
          >
            {lines.map((line, i) => (
              <div key={i}>
                {line.length > 0 ? renderHighlightedText(line) : "\u00A0"}
              </div>
            ))}
          </div>

          {/* Actual textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            readOnly={readOnly}
            placeholder={placeholder}
            spellCheck={false}
            className={cn(
              "w-full min-h-[200px] py-3 px-4 bg-transparent font-mono text-sm leading-[1.625rem] resize-none outline-none",
              "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
              "caret-[var(--accent-blue)]",
              readOnly && "cursor-default opacity-70"
            )}
          />
        </div>
      </div>
    </div>
  );
}

export function extractVariables(text: string): string[] {
  const matches = text.match(/{{([^}]+)}}/g);
  if (!matches) return [];
  const vars = matches.map((m) => m.replace(/{{|}}/g, "").trim());
  return Array.from(new Set(vars));
}
