"use client";

import { useMemo } from "react";
import { AIMessage } from "langchain";
import { useMessages, type AnyStream, type SubagentDiscoverySnapshot } from "@langchain/react";
import { FileCodeIcon, FileJsonIcon, FileTextIcon } from "lucide-react";

import { StatusIcon } from "src/components/reviewer-status";
import { extractFilePath, fileName, languageLabel } from "src/lib/reviewers";
import { cn } from "src/lib/utils";

function FileGlyph({ path, className }: { path: string | null; className?: string }) {
  const ext = path?.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return <FileJsonIcon className={className} />;
  if (ext === "md") return <FileTextIcon className={className} />;
  return <FileCodeIcon className={className} />;
}

function firstLine(text: string): string {
  const line =
    text
      .trim()
      .split("\n")
      .find((l) => l.trim().length > 0) ?? text;
  return line.replace(/^[#*->\s]+/, "").trim();
}

export interface ReviewerCardProps {
  stream: AnyStream;
  subagent: SubagentDiscoverySnapshot;
  index: number;
  onOpen: () => void;
}

export function ReviewerCard({ stream, subagent, index, onOpen }: ReviewerCardProps) {
  const messages = useMessages(stream, subagent);
  const path = extractFilePath(subagent.taskInput);
  const name = fileName(path) ?? `Reviewer ${index + 1}`;

  const preview = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (AIMessage.isInstance(msg) && msg.text.trim()) {
        return firstLine(msg.text);
      }
    }
    return null;
  }, [messages]);

  const statusLabel =
    subagent.status === "running"
      ? "Reading & reviewing…"
      : subagent.status === "error"
        ? "Review failed"
        : "Review complete";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors",
        "hover:border-foreground/20 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        subagent.status === "running" && "border-blue-500/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground",
            subagent.status === "complete" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          <FileGlyph path={path} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{languageLabel(path)}</p>
        </div>
        <StatusIcon status={subagent.status} />
      </div>

      <p
        className={cn(
          "line-clamp-2 min-h-[2.25rem] text-xs leading-snug text-muted-foreground",
          subagent.status === "running" && !preview && "shimmer",
        )}
      >
        {preview ?? statusLabel}
      </p>

      <span className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        View this reviewer&apos;s work →
      </span>
    </button>
  );
}
