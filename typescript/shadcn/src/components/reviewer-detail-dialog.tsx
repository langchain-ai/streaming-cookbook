"use client";

import { useMemo } from "react";
import { AIMessage } from "langchain";
import {
  useMessages,
  useToolCalls,
  type AnyStream,
  type AssembledToolCall,
  type SubagentDiscoverySnapshot,
} from "@langchain/react";
import { FileSearchIcon, TerminalIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { ScrollArea } from "src/components/ui/scroll-area";
import { Response } from "src/components/response";
import { StatusIcon, StatusPill } from "src/components/reviewer-status";
import { extractFilePath, fileName, languageLabel } from "src/lib/reviewers";
import { cn } from "src/lib/utils";

type TranscriptItem =
  | { kind: "text"; content: string; key: string }
  | { kind: "tool"; call: AssembledToolCall; key: string };

const TOOL_STATE_STYLES = {
  running: "text-blue-600 dark:text-blue-400",
  finished: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
} as const;

function ToolRow({ call }: { call: AssembledToolCall }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs",
        TOOL_STATE_STYLES[call.status],
      )}
    >
      <TerminalIcon className="size-3.5 shrink-0" />
      <span className="truncate font-semibold">{call.name}</span>
    </div>
  );
}

export interface ReviewerDetailDialogProps {
  stream: AnyStream;
  subagent: SubagentDiscoverySnapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewerDetailDialog({
  stream,
  subagent,
  open,
  onOpenChange,
}: ReviewerDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        {subagent ? (
          <ReviewerDetailBody stream={stream} subagent={subagent} />
        ) : (
          <DialogHeader className="p-6">
            <DialogTitle>Reviewer</DialogTitle>
            <DialogDescription>No reviewer selected.</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewerDetailBody({
  stream,
  subagent,
}: {
  stream: AnyStream;
  subagent: SubagentDiscoverySnapshot;
}) {
  const messages = useMessages(stream, subagent);
  const toolCalls = useToolCalls(stream, subagent);

  const path = extractFilePath(subagent.taskInput);
  const name = fileName(path) ?? "Source file";

  const items = useMemo<TranscriptItem[]>(() => {
    const result: TranscriptItem[] = [];
    const seen = new Set<string>();
    for (const msg of messages) {
      if (!AIMessage.isInstance(msg)) continue;
      if (msg.text.trim()) {
        result.push({ kind: "text", content: msg.text, key: `text-${msg.id}` });
      }
      const ids = new Set(msg.tool_calls?.map((t) => t.id) ?? []);
      for (const tc of toolCalls) {
        if (ids.has(tc.callId) && !seen.has(tc.callId)) {
          seen.add(tc.callId);
          result.push({ kind: "tool", call: tc, key: `tool-${tc.callId}` });
        }
      }
    }
    return result;
  }, [messages, toolCalls]);

  return (
    <>
      <DialogHeader className="space-y-2 border-b p-5 text-left">
        <div className="flex items-center gap-2">
          <FileSearchIcon className="size-4 text-muted-foreground" />
          <DialogTitle className="font-mono text-sm">{name}</DialogTitle>
          <StatusPill status={subagent.status} />
        </div>
        <DialogDescription>
          Reviewing the {languageLabel(path)} file
          {path ? <span className="font-mono"> {path}</span> : null}. Live transcript of this
          reviewer agent.
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[55vh]">
        <div className="space-y-2.5 p-5">
          {items.map((item, i) =>
            item.kind === "text" ? (
              <div key={item.key} className="text-sm text-foreground">
                <Response>{item.content}</Response>
                {subagent.status === "running" && i === items.length - 1 && (
                  <span className="ml-0.5 animate-pulse text-blue-500">▌</span>
                )}
              </div>
            ) : (
              <ToolRow key={item.key} call={item.call} />
            ),
          )}

          {items.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusIcon status={subagent.status} />
              {subagent.status === "running" ? (
                <span className="shimmer">Reading the file and forming an opinion…</span>
              ) : subagent.status === "error" ? (
                "This reviewer hit an error before reporting back."
              ) : (
                "No output from this reviewer."
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
