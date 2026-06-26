"use client";

import {
  FileCodeIcon,
  FileJsonIcon,
  FileTextIcon,
  GitPullRequestIcon,
  ListChecksIcon,
  RocketIcon,
  ScanSearchIcon,
  ShieldAlertIcon,
} from "lucide-react";

import { Suggestion, Suggestions } from "src/components/ui/suggestion";

const PROJECT_FILES = [
  { name: "package.json", icon: FileJsonIcon },
  { name: "README.md", icon: FileTextIcon },
  { name: "src/index.js", icon: FileCodeIcon },
  { name: "src/store.js", icon: FileCodeIcon },
  { name: "src/router.js", icon: FileCodeIcon },
];

const PRESETS = [
  { prompt: "Review the todo-api project", icon: ScanSearchIcon },
  { prompt: "Is it ready to ship?", icon: RocketIcon },
  { prompt: "Flag the riskiest file", icon: ShieldAlertIcon },
  { prompt: "Summarize all findings", icon: ListChecksIcon },
];

interface EmptyStateProps {
  onStart: (prompt: string) => void;
}

export function EmptyState({ onStart }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted">
        <GitPullRequestIcon className="size-6 text-primary" />
      </div>

      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold">Automated code review</h1>
        <p className="text-sm text-muted-foreground">
          A <span className="font-medium text-foreground">deep agent</span> checks the{" "}
          <span className="font-mono text-foreground">todo-api</span> project into a sandbox, then
          spins up one specialist reviewer for every file so the whole codebase is reviewed in
          parallel. Watch each reviewer work, then read the lead engineer&apos;s overview.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {PROJECT_FILES.map(({ name, icon: Icon }) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground"
          >
            <Icon className="size-3.5" />
            {name}
          </span>
        ))}
      </div>

      <Suggestions className="max-w-xl justify-center">
        {PRESETS.map(({ prompt, icon: Icon }) => (
          <Suggestion key={prompt} suggestion={prompt} onClick={onStart}>
            <Icon className="size-4 text-muted-foreground" />
            {prompt}
          </Suggestion>
        ))}
      </Suggestions>
    </div>
  );
}
