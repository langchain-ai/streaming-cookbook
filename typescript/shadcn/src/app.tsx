import { GitPullRequestIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useStream, type AnyStream } from "@langchain/react";
import { inject, track } from "@vercel/analytics";

import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
} from "src/components/ai-elements/prompt-input";
import { InputGroupAddon } from "src/components/ui/input-group";
import { Button } from "src/components/ui/button";
import { ChatThread } from "src/components/chat-thread";
import { EmptyState } from "src/components/empty-state";
import { LANGGRAPH_API_URL, LANGGRAPH_ASSISTANT_ID } from "src/lib/stream";
import { useThreadIdParam } from "src/lib/thread-id";

/**
 * Vercel Analytics
 */
inject({ mode: "auto", scriptSrc: "/_vercel/insights/script.js" });

export function App() {
  const [threadId, onThreadId] = useThreadIdParam();
  const [inputText, setInputText] = useState("");

  useEffect(() => {
    track("pattern_viewed", { pattern: "shadcn-code-review" });
  }, []);

  const stream = useStream({
    apiUrl: LANGGRAPH_API_URL,
    assistantId: LANGGRAPH_ASSISTANT_ID,
    onThreadId,
    threadId,
  });

  const subagents = Array.from(stream.subagents.values());
  const hasMessages = stream.messages.length > 0;

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      track("prompt_submitted", { source: "custom", prompt: trimmed });
      setInputText("");
      stream.submit({ messages: [{ type: "human", content: trimmed }] });
    },
    [stream],
  );

  const handleSubmit = useCallback((message: { text: string }) => submit(message.text), [submit]);

  const handleStart = useCallback(
    (prompt: string) => {
      track("prompt_submitted", { source: "preset", prompt });
      stream.submit({ messages: [{ type: "human", content: prompt }] });
    },
    [stream],
  );

  const handleNewReview = useCallback(() => {
    onThreadId(undefined);
    setInputText("");
  }, [onThreadId]);

  const chatStatus = stream.isLoading ? "streaming" : "ready";

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitPullRequestIcon className="size-4 text-primary" />
          <span className="text-sm font-semibold">Code Review Crew</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            deep agent · one reviewer per file
          </span>
        </div>
        {hasMessages && (
          <Button variant="ghost" size="sm" onClick={handleNewReview} className="gap-1.5">
            <PlusIcon className="size-4" />
            New review
          </Button>
        )}
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {hasMessages ? (
          <ChatThread
            stream={stream as AnyStream}
            messages={stream.messages}
            subagents={subagents}
            isLoading={stream.isLoading}
          />
        ) : (
          <EmptyState onStart={handleStart} />
        )}

        <div className="shrink-0 border-t">
          <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-3">
            <PromptInput onSubmit={handleSubmit} className="w-full">
              <PromptInputBody>
                <PromptInputTextarea
                  value={inputText}
                  placeholder="Ask the review crew to look at the project…"
                  className="min-h-14 py-4.5"
                  onChange={(e) => setInputText(e.target.value)}
                />
              </PromptInputBody>
              <InputGroupAddon align="inline-end" className="pr-2 mr-0!">
                <PromptInputSubmit
                  status={chatStatus}
                  disabled={!inputText.trim() && !stream.isLoading}
                />
              </InputGroupAddon>
            </PromptInput>
          </div>
        </div>
      </main>
    </div>
  );
}
