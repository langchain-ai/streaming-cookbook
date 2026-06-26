/**
 * Helpers for turning a `file-reviewer` subagent's task input into a friendly,
 * file-centric label for the UI. Each reviewer owns exactly one file and its
 * task description names that file (e.g. "Review /app/src/store.js").
 */

const PATH_RE = /\/app\/[\w./-]+|\b[\w./-]+\.(?:js|ts|tsx|jsx|json|md|css|html|yml|yaml)\b/;

export function extractFilePath(taskInput: string | undefined): string | null {
  if (!taskInput) return null;
  const match = taskInput.match(PATH_RE);
  return match ? match[0] : null;
}

export function fileName(path: string | null): string | null {
  if (!path) return null;
  return path.split("/").filter(Boolean).pop() ?? path;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  js: "JavaScript",
  jsx: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  json: "JSON",
  md: "Markdown",
  css: "CSS",
  html: "HTML",
  yml: "YAML",
  yaml: "YAML",
};

export function languageLabel(path: string | null): string {
  if (!path) return "File";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "File";
}
