"use client";

import { useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  FilePenIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderSearchIcon,
  LoaderIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "src/components/ui/collapsible";
import { cn } from "src/lib/utils";

export type ToolStatus = "running" | "finished" | "error";

export interface ToolActivityProps {
  name: string;
  args?: Record<string, unknown>;
  output?: unknown;
  status: ToolStatus;
}

function meta(name: string): { label: string; Icon: LucideIcon } {
  switch (name) {
    case "ls":
    case "list_files":
    case "list_directory":
      return { label: "Listed project files", Icon: FolderSearchIcon };
    case "glob":
    case "grep":
    case "search":
      return { label: "Searched the project", Icon: FolderSearchIcon };
    case "read_file":
    case "read":
      return { label: "Read a file", Icon: FileTextIcon };
    case "write_file":
    case "write":
      return { label: "Wrote a file", Icon: FilePlusIcon };
    case "edit_file":
    case "edit":
    case "str_replace":
      return { label: "Edited a file", Icon: FilePenIcon };
    case "execute":
    case "shell":
    case "run":
      return { label: "Ran a command", Icon: TerminalIcon };
    default:
      return { label: name, Icon: WrenchIcon };
  }
}

const DETAIL_KEYS = ["path", "file_path", "filePath", "pattern", "command", "dir", "directory"];

function detail(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  for (const key of DETAIL_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StatusGlyph({ status }: { status: ToolStatus }) {
  if (status === "running") return <LoaderIcon className="size-3.5 animate-spin text-blue-500" />;
  if (status === "error") return <XIcon className="size-3.5 text-destructive" />;
  return <CheckIcon className="size-3.5 text-emerald-500" />;
}

export function ToolActivity({ name, args, output, status }: ToolActivityProps) {
  const [open, setOpen] = useState(false);
  const { label, Icon } = meta(name);
  const subtitle = detail(args);
  const argsText = args && Object.keys(args).length > 0 ? stringify(args) : "";
  const outputText = stringify(output);
  const hasBody = Boolean(argsText || outputText);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-lg border bg-muted/40"
    >
      <CollapsibleTrigger
        disabled={!hasBody}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
          hasBody && "hover:bg-muted/70",
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{label}</span>
        {subtitle && <span className="truncate font-mono text-muted-foreground">{subtitle}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <StatusGlyph status={status} />
          {hasBody && (
            <ChevronRightIcon
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
          )}
        </span>
      </CollapsibleTrigger>

      {hasBody && (
        <CollapsibleContent>
          <div className="space-y-2 border-t px-3 py-2">
            {argsText && (
              <div className="space-y-1">
                <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Input
                </p>
                <pre className="max-h-40 overflow-auto rounded-md bg-background p-2 font-mono text-[0.7rem] leading-relaxed">
                  {argsText}
                </pre>
              </div>
            )}
            {outputText && (
              <div className="space-y-1">
                <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Output
                </p>
                <pre className="max-h-48 overflow-auto rounded-md bg-background p-2 font-mono text-[0.7rem] leading-relaxed">
                  {outputText}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
