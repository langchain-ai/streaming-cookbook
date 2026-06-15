/**
 * Shared OpenUI component vocabulary.
 *
 * The SAME library object is used in two places:
 *  - server side (src/agent.ts) to generate the shared panel system prompt
 *    once via `library.prompt(...)`, and
 *  - client side (src/App.tsx) as the `library` prop of `<Renderer>`.
 *
 * Sharing one object means the prompt and the renderer can never drift:
 * whatever components the model is told about are exactly the ones the
 * renderer can draw.
 *
 * @module library
 */

import {
  openuiChatLibrary,
  openuiChatPromptOptions,
} from "@openuidev/react-ui";

export const library = openuiChatLibrary;
export const promptOptions = openuiChatPromptOptions;
