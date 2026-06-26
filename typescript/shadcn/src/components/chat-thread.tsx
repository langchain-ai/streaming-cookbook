"use client";

import { useMemo, useState } from "react";
import type { BaseMessage } from "langchain";
import { AIMessage, HumanMessage } from "langchain";
import type { AnyStream, SubagentDiscoverySnapshot } from "@langchain/react";
import { BotIcon, SparklesIcon, UsersIcon, UserIcon } from "lucide-react";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
} from "src/components/ui/message-scroller";
import { Message, MessageAvatar, MessageBody, MessageHeader } from "src/components/ui/message";
import { Bubble } from "src/components/ui/bubble";
import { Marker } from "src/components/ui/marker";
import { Response } from "src/components/response";
import { ReviewerCard } from "src/components/reviewer-card";
import { ReviewerDetailDialog } from "src/components/reviewer-detail-dialog";
import { ToolActivity, type ToolStatus } from "src/components/tool-activity";

interface ChatThreadProps {
  stream: AnyStream;
  messages: BaseMessage[];
  subagents: SubagentDiscoverySnapshot[];
  isLoading: boolean;
}

export function ChatThread({ stream, messages, subagents, isLoading }: ChatThreadProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const subagentsByCallId = useMemo(() => new Map(subagents.map((s) => [s.id, s])), [subagents]);

  // Map each tool-call id to its result, parsed from the matching ToolMessage.
  const toolResultMap = useMemo(() => {
    const map = new Map<string, unknown>();
    for (const msg of messages) {
      if (msg.type !== "tool") continue;
      const id = (msg as BaseMessage & { tool_call_id?: string }).tool_call_id;
      if (!id) continue;
      const raw = msg.text;
      try {
        map.set(id, JSON.parse(raw));
      } catch {
        map.set(id, raw);
      }
    }
    return map;
  }, [messages]);

  const total = subagents.length;
  const done = subagents.filter((s) => s.status === "complete" || s.status === "error").length;
  const allDone = total > 0 && done === total;

  const rendered = useMemo(
    () =>
      messages.filter((msg) => {
        if (HumanMessage.isInstance(msg)) return true;
        if (AIMessage.isInstance(msg)) {
          if (msg.text.trim().length > 0) return true;
          return !!msg.tool_calls && msg.tool_calls.length > 0;
        }
        return false;
      }),
    [messages],
  );

  const lastMsg = rendered.at(-1);
  const waitingForFirstReply =
    isLoading && (!lastMsg || HumanMessage.isInstance(lastMsg)) && total === 0;

  const selected = subagents.find((s) => s.id === selectedId) ?? null;

  return (
    <MessageScroller className="scroll-fade">
      <MessageScrollerContent>
        {rendered.map((msg, i) => {
          const key = msg.id ?? `msg-${i}`;

          if (HumanMessage.isInstance(msg)) {
            return (
              <Message key={key} from="user">
                <MessageAvatar className="bg-primary text-primary-foreground">
                  <UserIcon className="size-4" />
                </MessageAvatar>
                <MessageBody>
                  <Bubble variant="primary" align="end">
                    {msg.text}
                  </Bubble>
                </MessageBody>
              </Message>
            );
          }

          const allToolCalls = AIMessage.isInstance(msg) ? (msg.tool_calls ?? []) : [];
          const turnSubagents = allToolCalls
            .map((tc) => subagentsByCallId.get(tc.id ?? ""))
            .filter((s): s is SubagentDiscoverySnapshot => !!s);
          const toolActivities = allToolCalls.filter(
            (tc) => tc.name !== "task" && !subagentsByCallId.has(tc.id ?? ""),
          );
          const isLastRendered = i === rendered.length - 1;

          return (
            <Message key={key} from="assistant">
              <MessageAvatar>
                <BotIcon className="size-4" />
              </MessageAvatar>
              <MessageBody>
                <MessageHeader>Lead engineer</MessageHeader>
                {msg.text.trim().length > 0 && (
                  <Bubble variant="default" align="start">
                    <Response>{msg.text}</Response>
                  </Bubble>
                )}

                {toolActivities.map((tc) => {
                  const hasResult = toolResultMap.has(tc.id ?? "");
                  const status: ToolStatus =
                    hasResult || !(isLastRendered && isLoading) ? "finished" : "running";
                  return (
                    <ToolActivity
                      key={tc.id ?? tc.name}
                      name={tc.name}
                      args={tc.args}
                      output={toolResultMap.get(tc.id ?? "")}
                      status={status}
                    />
                  );
                })}

                {turnSubagents.length > 0 && (
                  <ReviewCrew stream={stream} subagents={turnSubagents} onSelect={setSelectedId} />
                )}
              </MessageBody>
            </Message>
          );
        })}

        {waitingForFirstReply && (
          <Marker variant="status" shimmer icon={<BotIcon className="size-3.5" />}>
            Scanning the project files…
          </Marker>
        )}

        {isLoading && allDone && (
          <Marker variant="status" shimmer icon={<SparklesIcon className="size-3.5" />}>
            All reviewers reported back — synthesizing the overview…
          </Marker>
        )}
      </MessageScrollerContent>
      <MessageScrollerButton />

      <ReviewerDetailDialog
        stream={stream}
        subagent={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </MessageScroller>
  );
}

function ReviewCrew({
  stream,
  subagents,
  onSelect,
}: {
  stream: AnyStream;
  subagents: SubagentDiscoverySnapshot[];
  onSelect: (id: string) => void;
}) {
  const total = subagents.length;
  const done = subagents.filter((s) => s.status === "complete" || s.status === "error").length;
  const progress = total ? (done / total) * 100 : 0;

  return (
    <div className="mt-1 space-y-2.5">
      <div className="flex items-center gap-2">
        <UsersIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Review crew · {done}/{total} files reviewed
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {subagents.map((subagent, index) => (
          <ReviewerCard
            key={subagent.id}
            stream={stream}
            subagent={subagent}
            index={index}
            onOpen={() => onSelect(subagent.id)}
          />
        ))}
      </div>
    </div>
  );
}
