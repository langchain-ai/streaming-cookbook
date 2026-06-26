"use client";

import type { ComponentProps } from "react";

import { cn } from "src/lib/utils";

/**
 * Message — lays out a row in the conversation with avatar, alignment,
 * header, content, and footer.
 *
 * Mirrors the shadcn/ui `Message` chat component. Set `from` to control
 * alignment and the data attribute used for grouped styling.
 */
export type MessageProps = ComponentProps<"div"> & {
  from: "user" | "assistant" | "system";
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    data-from={from}
    className={cn(
      "group/message flex w-full items-start gap-3",
      from === "user" && "flex-row-reverse",
      className,
    )}
    {...props}
  />
);

export type MessageAvatarProps = ComponentProps<"div">;

export const MessageAvatar = ({ className, children, ...props }: MessageAvatarProps) => (
  <div
    className={cn(
      "flex size-8 shrink-0 select-none items-center justify-center rounded-full border bg-background text-xs font-medium text-muted-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageBodyProps = ComponentProps<"div">;

export const MessageBody = ({ className, ...props }: MessageBodyProps) => (
  <div
    className={cn(
      "flex min-w-0 flex-1 flex-col gap-1 group-data-[from=user]/message:items-end",
      className,
    )}
    {...props}
  />
);

export type MessageHeaderProps = ComponentProps<"div">;

export const MessageHeader = ({ className, ...props }: MessageHeaderProps) => (
  <div
    className={cn("flex items-center gap-2 text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
);

export type MessageContentProps = ComponentProps<"div">;

export const MessageContent = ({ className, ...props }: MessageContentProps) => (
  <div className={cn("flex w-full min-w-0 flex-col gap-2", className)} {...props} />
);

export type MessageFooterProps = ComponentProps<"div">;

export const MessageFooter = ({ className, ...props }: MessageFooterProps) => (
  <div
    className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}
    {...props}
  />
);
