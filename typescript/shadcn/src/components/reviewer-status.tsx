import type { SubagentDiscoverySnapshot } from "@langchain/react";
import { CheckCircle2Icon, CircleDashedIcon, LoaderIcon, XCircleIcon } from "lucide-react";

import { cn } from "src/lib/utils";

export type ReviewStatus = SubagentDiscoverySnapshot["status"];

const STATUS_META: Record<ReviewStatus, { label: string; dot: string; text: string }> = {
  running: {
    label: "Reviewing",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  complete: {
    label: "Done",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    label: "Failed",
    dot: "bg-destructive",
    text: "text-destructive",
  },
};

export function StatusPill({ status }: { status: ReviewStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.text,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", meta.dot, status === "running" && "animate-pulse")}
      />
      {meta.label}
    </span>
  );
}

export function StatusIcon({ status, className }: { status: ReviewStatus; className?: string }) {
  if (status === "running") {
    return <LoaderIcon className={cn("size-4 animate-spin text-blue-500", className)} />;
  }
  if (status === "complete") {
    return <CheckCircle2Icon className={cn("size-4 text-emerald-500", className)} />;
  }
  if (status === "error") {
    return <XCircleIcon className={cn("size-4 text-destructive", className)} />;
  }
  return <CircleDashedIcon className={cn("size-4 text-muted-foreground", className)} />;
}
