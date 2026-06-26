"use client";

import type { ComponentProps } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "src/lib/utils";

/**
 * Bubble — the message surface, with variants and alignment.
 *
 * Mirrors the shadcn/ui `Bubble` chat component. Compose it inside a
 * `Message` row, or use it on its own for a single speech bubble.
 */
const bubbleVariants = cva(
  "w-fit max-w-full min-w-0 overflow-hidden break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border bg-background text-foreground",
        ghost: "bg-transparent px-0 py-0 text-foreground",
      },
      align: {
        start: "mr-auto rounded-bl-sm",
        end: "ml-auto rounded-br-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      align: "start",
    },
  },
);

export type BubbleProps = ComponentProps<"div"> & VariantProps<typeof bubbleVariants>;

export const Bubble = ({ className, variant, align, ...props }: BubbleProps) => (
  <div className={cn(bubbleVariants({ variant, align }), className)} {...props} />
);

export type BubbleFooterProps = ComponentProps<"div">;

export const BubbleFooter = ({ className, ...props }: BubbleFooterProps) => (
  <div
    className={cn("mt-1.5 flex items-center gap-1 text-xs text-muted-foreground", className)}
    {...props}
  />
);
