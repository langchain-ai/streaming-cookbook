"use client";

import type { ComponentProps, ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "src/lib/utils";

/**
 * Marker — renders status updates, system notes, bordered rows, and labeled
 * separators for things like streaming state, tool activity, and date breaks.
 *
 * Mirrors the shadcn/ui `Marker` chat component.
 */
const markerVariants = cva("flex items-center gap-2 text-xs", {
  variants: {
    variant: {
      status: "text-muted-foreground",
      note: "justify-center text-muted-foreground",
      separator:
        "text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border",
    },
  },
  defaultVariants: {
    variant: "status",
  },
});

export type MarkerProps = ComponentProps<"div"> &
  VariantProps<typeof markerVariants> & {
    icon?: ReactNode;
    /** Animate the label with a subtle shimmer to signal live activity. */
    shimmer?: boolean;
  };

export const Marker = ({ className, variant, icon, shimmer, children, ...props }: MarkerProps) => (
  <div className={cn(markerVariants({ variant }), className)} {...props}>
    {icon}
    <span className={cn("min-w-0", shimmer && "shimmer")}>{children}</span>
  </div>
);
