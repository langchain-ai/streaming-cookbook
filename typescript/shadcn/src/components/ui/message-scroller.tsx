"use client";

import type { ComponentProps } from "react";

import { Button } from "src/components/ui/button";
import { cn } from "src/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

/**
 * MessageScroller — the scroll container for a conversation.
 *
 * Mirrors the shadcn/ui `MessageScroller` chat component: it owns the scroll
 * behavior that is easy to get wrong (anchored turns, streamed replies,
 * auto-follow, jump-to-bottom) without owning your messages or AI state.
 */
export type MessageScrollerProps = ComponentProps<typeof StickToBottom>;

export const MessageScroller = ({ className, ...props }: MessageScrollerProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type MessageScrollerContentProps = ComponentProps<typeof StickToBottom.Content>;

export const MessageScrollerContent = ({ className, ...props }: MessageScrollerContentProps) => (
  <StickToBottom.Content
    className={cn("mx-auto flex w-full max-w-2xl flex-col gap-6 p-4", className)}
    {...props}
  />
);

export type MessageScrollerButtonProps = ComponentProps<typeof Button>;

export const MessageScrollerButton = ({ className, ...props }: MessageScrollerButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) return null;

  return (
    <Button
      aria-label="Scroll to latest"
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md",
        className,
      )}
      onClick={handleScrollToBottom}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
};
