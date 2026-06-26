"use client";

import type { ComponentProps } from "react";
import { useCallback } from "react";

import { Button } from "src/components/ui/button";
import { cn } from "src/lib/utils";

/**
 * Suggestion / Suggestions — preset prompt chips the user can click to start a
 * conversation. shadcn registry style: a flex container plus a button-based
 * chip that emits its own text on click.
 */
export type SuggestionsProps = ComponentProps<"div">;

export const Suggestions = ({ className, ...props }: SuggestionsProps) => (
  <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => onClick?.(suggestion), [onClick, suggestion]);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn("rounded-full px-4", className)}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
};
