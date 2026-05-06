import type { A2uiClientAction } from "@a2ui/web_core/v0_9";

/**
 * Formats an A2UI client action into a human-readable message string.
 *
 * Creates a summary showing the action name and key-value pairs from its context.
 * Handles different value types: arrays are joined with commas, booleans become "yes"/"no",
 * and other values are stringified. Limits display to first 4 entries with a count
 * indicator for additional fields.
 *
 * @param action - The A2UI client action containing name and optional context data.
 * @returns A formatted message describing the action and its context.
 *
 * @example
 * ```ts
 * formatActionMessage({ name: "button_click", context: { id: "submit", confirmed: true } })
 * // Returns: Handled "button_click" with id: submit; confirmed: yes.
 * ```
 */
function formatActionMessage(action: A2uiClientAction) {
  if (action.context == null || typeof action.context !== "object") {
    return `Handled "${action.name}".`;
  }

  const entries = Object.entries(action.context as Record<string, unknown>);
  const preview = entries
    .slice(0, 4)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (typeof value === "boolean") return `${key}: ${value ? "yes" : "no"}`;
      return `${key}: ${String(value)}`;
    })
    .join("; ");
  const suffix = entries.length > 4 ? `, plus ${entries.length - 4} more fields` : "";

  return `Handled "${action.name}" with ${preview}${suffix}.`;
}

/**
 * Processes an A2UI client action and returns the corresponding A2UI message.
 * @param surfaceId - The ID of the surface that the action belongs to.
 * @param action - The A2UI client action to process.
 * @returns The A2UI message corresponding to the action.
 */
export function processA2UIMessage(surfaceId: string, action: A2uiClientAction) {
  return [
    {
      version: "v0.9" as const,
      updateDataModel: {
        surfaceId,
        path: "/__host/latestAction",
        value: {
          name: action.name,
          context: action.context ?? {},
          message: formatActionMessage(action),
        },
      },
    },
  ]
}
